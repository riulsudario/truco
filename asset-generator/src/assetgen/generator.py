"""Generate candidates for catalog assets: queue, retry, post-process, record."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Protocol

from PIL import Image

from .config import Project, file_sha256
from .processing import Palette, process_sprite, process_tile, tile_preview, upscale
from .state import State
from .workflow import WORKFLOW_VERSION, build_graph, compose_negative, compose_prompt


class Backend(Protocol):
    def prepare_reference(self, path: Path, crops: list | None = None) -> str | list[str]: ...
    def generate(self, graph: dict) -> Image.Image: ...
    def finish(self) -> None: ...
    def info(self) -> dict: ...


def seed_for(salt: str, asset_id: str, round_: int, slot: int, attempt: int) -> int:
    digest = hashlib.sha256(f"{salt}:{asset_id}:{round_}:{slot}:{attempt}".encode()).hexdigest()
    return int(digest[:8], 16) & 0x7FFFFFFF


class VramMonitor:
    """Peak GPU memory in MiB, sampled with nvidia-smi while a prompt runs."""

    def __init__(self, interval: float = 0.5):
        self.interval = interval
        self.peak = None
        self._stop = threading.Event()
        self._thread = None

    @staticmethod
    def used_mib() -> int | None:
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=5)
            return int(out.stdout.split()[0])
        except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
            return None

    def __enter__(self):
        def loop():
            while not self._stop.is_set():
                used = self.used_mib()
                if used is not None:
                    self.peak = max(self.peak or 0, used)
                self._stop.wait(self.interval)
        self._thread = threading.Thread(target=loop, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join()


class Generator:
    def __init__(self, project: Project, state: State, backend: Backend, log=print):
        self.project = project
        self.state = state
        self.backend = backend
        self.log = log
        self.settings = project.settings

    # -- planning -----------------------------------------------------------
    def plan(self, assets: list[dict], new_round: bool = False) -> None:
        """Queue candidates. A new round adds fresh slots; old candidates are kept."""
        for asset in assets:
            self.state.ensure_asset(asset["id"], asset["catalog"])
            current = self.state.current_round(asset["id"])
            if current and not new_round:
                continue
            round_ = current + 1
            salt = self.project.style(asset["style"])["generation"]["seed_salt"]
            for slot in range(1, asset["generation"]["candidates"] + 1):
                self.state.add_candidate(asset["id"], round_, slot, 1, seed_for(salt, asset["id"], round_, slot, 1))
            self.refresh_asset_status(asset["id"])

    # -- execution ----------------------------------------------------------
    def run(self, assets: list[dict]) -> dict:
        by_id = {a["id"]: a for a in assets}
        stats = {"generated": 0, "validated": 0, "failed": 0, "retries": 0, "seconds": 0.0, "per_asset": {}}
        started = time.time()
        try:
            while True:
                pending = [c for c in self.state.candidates(status="pending") if c["asset_id"] in by_id]
                if not pending:
                    break
                cand = pending[0]
                asset = by_id[cand["asset_id"]]
                outcome = self.run_candidate(asset, cand)
                per = stats["per_asset"].setdefault(asset["id"], {"seconds": 0.0, "attempts": 0})
                per["seconds"] = round(per["seconds"] + outcome["seconds"], 2)
                per["attempts"] += 1
                stats["generated"] += outcome["generated"]
                stats["validated" if outcome["ok"] else "failed"] += 1
                # max_retries counts retries, so a slot gets at most 1 + max_retries attempts.
                if not outcome["ok"] and cand["attempt"] <= asset["generation"]["max_retries"]:
                    salt = self.project.style(asset["style"])["generation"]["seed_salt"]
                    attempt = cand["attempt"] + 1
                    self.state.add_candidate(asset["id"], cand["round"], cand["slot"], attempt,
                                             seed_for(salt, asset["id"], cand["round"], cand["slot"], attempt))
                    stats["retries"] += 1
                self.refresh_asset_status(asset["id"])
        finally:
            if self.settings["generation"].get("unload_after_batch", True):
                self.backend.finish()
        stats["seconds"] = round(time.time() - started, 2)
        return stats

    def output_dir(self, asset: dict) -> Path:
        base = self.project.path(self.settings["paths"]["output"])
        if asset["catalog"] == "validation":
            return base / "validation" / asset["id"]
        return base / "production" / asset["catalog"] / asset["id"]

    def run_candidate(self, asset: dict, cand) -> dict:
        style_id = asset["style"]
        style = self.project.style(style_id)
        gen_cfg = self.settings["generation"]
        out_dir = self.output_dir(asset)
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = f"r{cand['round']}_s{cand['slot']}_a{cand['attempt']}_{cand['seed']}"
        raw_path, sprite_path = out_dir / f"{stem}_raw.png", out_dir / f"{stem}.png"
        if raw_path.exists() or sprite_path.exists():
            raise FileExistsError(f"refusing to overwrite {raw_path}")

        reference = self.project.path(style["reference"])
        crops = (style.get("ip_adapter") or {}).get("crops")
        ref_name = self.backend.prepare_reference(reference, crops) if reference.exists() else None
        graph = build_graph(style=style, asset=asset, seed=cand["seed"], width=gen_cfg["width"],
                            height=gen_cfg["height"], reference_image=ref_name)
        meta = {
            "asset_id": asset["id"], "catalog": asset["catalog"], "style": style_id,
            "style_sha256": file_sha256(self.project.style_path(style_id)),
            "reference": str(reference.relative_to(self.project.root)) if ref_name else None,
            "reference_inputs": ref_name, "reference_crops": crops,
            "reference_sha256": file_sha256(reference) if ref_name else None,
            "prompt": compose_prompt(style, asset), "negative": compose_negative(style, asset),
            "seed": cand["seed"], "round": cand["round"], "slot": cand["slot"], "attempt": cand["attempt"],
            "sampling": {k: style["generation"][k] for k in ("steps", "cfg", "sampler", "scheduler")},
            "loras": style["generation"]["loras"], "ip_adapter": style.get("ip_adapter") if ref_name else None,
            "size": [gen_cfg["width"], gen_cfg["height"]], "workflow_version": WORKFLOW_VERSION,
            "graph": graph, "backend": self.backend.info(),
        }
        self.log(f"[{asset['id']}] round {cand['round']} slot {cand['slot']} attempt {cand['attempt']} "
                 f"seed {cand['seed']}")
        self.state.update_candidate(cand["id"], "generating", meta=meta)
        t0 = time.time()
        try:
            with VramMonitor() as vram:
                raw = self.backend.generate(graph)
        except Exception as err:  # noqa: BLE001 - recorded on the candidate and retried
            seconds = time.time() - t0
            self.state.update_candidate(cand["id"], "failed", f"generation error: {err}", error=str(err)[:4000],
                                        meta=meta | {"generation_seconds": round(seconds, 2)})
            self.log(f"  generation failed: {err}")
            return {"ok": False, "generated": 0, "seconds": seconds}
        gen_seconds = time.time() - t0
        raw.save(raw_path)
        meta |= {"generation_seconds": round(gen_seconds, 2), "vram_peak_mib": vram.peak,
                 "raw_sha256": file_sha256(raw_path)}
        self.state.update_candidate(cand["id"], "generated", raw_path=self.rel(raw_path), meta=meta)

        self.state.update_candidate(cand["id"], "processing")
        t1 = time.time()
        sprite_file, qc = self.process(asset, raw, sprite_path)
        fields = {"meta": meta | {"processing_seconds": round(time.time() - t1, 2)}, "qc": qc}
        if sprite_file is not None:
            fields["sprite_path"] = self.rel(sprite_file)
            fields["meta"]["sprite_sha256"] = file_sha256(sprite_file)
        (out_dir / f"{stem}.json").write_text(json.dumps(
            {k: v for k, v in fields["meta"].items() if k != "graph"} | {"qc": qc}, indent=2) + "\n")
        (out_dir / f"{stem}.workflow.json").write_text(json.dumps(graph, indent=2) + "\n")
        ok = not qc["errors"]
        detail = "; ".join(qc["errors"]) if qc["errors"] else None
        self.state.update_candidate(cand["id"], "validated" if ok else "failed", detail,
                                    error=detail, **fields)
        self.log(f"  {'ok' if ok else 'FAILED'} in {gen_seconds:.1f}s gen"
                 f"{', vram peak ' + str(vram.peak) + ' MiB' if vram.peak else ''}"
                 f"{' | ' + detail if detail else ''}{' | warn: ' + '; '.join(qc['warnings']) if qc['warnings'] else ''}")
        return {"ok": ok, "generated": 1, "seconds": time.time() - t0}

    def process(self, asset: dict, raw: Image.Image, sprite_path: Path) -> tuple[Path | None, dict]:
        """Turn a raw generation into the game sprite plus its review previews."""
        style = self.project.style(asset["style"])
        palette = Palette.from_style(style, self.project.root)
        if asset["kind"] == "tile":
            sprite, qc = process_tile(raw, asset, style, palette)
        else:
            sprite, qc = process_sprite(raw, asset, style, palette)
        if sprite is None:
            return None, qc
        base = sprite_path.with_suffix("")
        sprite.save(sprite_path)
        upscale(sprite, 8).save(f"{base}_x8.png")
        if asset["kind"] == "tile":
            tile_preview(sprite).save(f"{base}_tiled5x5.png")
        return sprite_path, qc

    def reprocess(self, assets: list[dict]) -> list[dict]:
        """Redo the downscale of candidates processed at another target size, from their raw
        image (no generation). The new sprite gets its own files; the old ones stay."""
        done = []
        for asset in assets:
            if self.state.asset(asset["id"]) is None or self.state.asset(asset["id"])["status"] == "approved":
                continue
            tw, th = asset["target_size"]["width"], asset["target_size"]["height"]
            for cand in self.state.candidates(asset["id"]):
                if not cand["raw_path"] or cand["status"] not in ("validated", "failed"):
                    continue
                if json.loads(cand["qc"]).get("canvas_size") == [tw, th]:
                    continue
                raw_path = self.project.path(cand["raw_path"])
                sprite_path = raw_path.with_name(raw_path.name.replace("_raw.png", f"_{tw}x{th}.png"))
                if sprite_path.exists():
                    raise FileExistsError(f"refusing to overwrite {sprite_path}")
                sprite_file, qc = self.process(asset, Image.open(raw_path), sprite_path)
                meta = json.loads(cand["meta"]) | {"reprocessed_from": cand["sprite_path"]}
                fields = {"meta": meta, "qc": qc}
                if sprite_file is not None:
                    fields["sprite_path"] = self.rel(sprite_file)
                    meta["sprite_sha256"] = file_sha256(sprite_file)
                sprite_path.with_suffix(".json").write_text(json.dumps(
                    {k: v for k, v in meta.items() if k != "graph"} | {"qc": qc}, indent=2) + "\n")
                ok = not qc["errors"]
                detail = f"reprocessed at {tw}x{th}" + ("" if ok else ": " + "; ".join(qc["errors"]))
                self.state.update_candidate(cand["id"], "validated" if ok else "failed", detail,
                                            error=None if ok else detail, **fields)
                done.append({"id": cand["id"], "asset_id": asset["id"], "ok": ok, "sprite": fields.get("sprite_path"),
                             "from": cand["sprite_path"], "warnings": qc["warnings"]})
            self.refresh_asset_status(asset["id"])
        return done

    def refresh_asset_status(self, asset_id: str) -> None:
        row = self.state.asset(asset_id)
        if row["status"] in ("approved", "rejected"):
            return
        statuses = {c["status"] for c in self.state.candidates(asset_id)}
        for status in ("generating", "processing", "pending"):
            if status in statuses:
                self.state.set_asset_status(asset_id, status)
                return
        if "validated" in statuses:
            self.state.set_asset_status(asset_id, "validated")
        elif "failed" in statuses:
            self.state.set_asset_status(asset_id, "failed", "every candidate failed")

    def rel(self, path: Path) -> str:
        return str(path.relative_to(self.project.root))


class ComfyBackend:
    """Backend that talks to a local ComfyUI server (started on demand)."""

    def __init__(self, project: Project):
        from .comfy import ComfyClient
        self.project = project
        self.settings = project.settings
        self.client = ComfyClient(project.root, self.settings)
        self._started = False

    def _ensure(self) -> None:
        if not self._started:
            self.client.ensure_server(self.project.path("output", "reports", "comfyui.log"))
            self._started = True

    def prepare_reference(self, path: Path, crops: list | None = None) -> str | list[str]:
        """Copy the reference (or square crops of it, at 512 px) into ComfyUI's input dir under
        content-addressed names. The original file is only read."""
        self._ensure()
        sub = self.settings["paths"]["comfy_input_subdir"]
        digest = file_sha256(path)[:12]
        image = Image.open(path).convert("RGB")
        names = []
        for box in crops or [None]:
            suffix = "" if box is None else "_" + "-".join(str(v) for v in box)
            name = f"{path.stem}_{digest}{suffix}.png"
            target = self.client.input_dir() / sub / name
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                part = image if box is None else image.crop(tuple(box)).resize((512, 512), Image.Resampling.NEAREST)
                part.save(target)
            names.append(f"{sub}/{name}")
        return names[0] if crops is None else names

    def generate(self, graph: dict) -> Image.Image:
        self._ensure()
        return self.client.run(graph)[0]

    def finish(self) -> None:
        if self._started:
            try:
                self.client.free()
            except Exception:  # noqa: BLE001 - freeing VRAM is best effort
                pass

    def info(self) -> dict:
        cfg = self.settings["comfyui"]
        lock = self.project.path("config", "models.lock.json")
        weights = json.loads(lock.read_text()) if lock.exists() else {}
        return {"comfyui_commit": cfg["commit"],
                "custom_nodes": {k: v["commit"] for k, v in cfg["custom_nodes"].items()},
                "weights": {k: {"file": v["file"], "sha256": v["sha256"]} for k, v in weights.items()}}

    def stop(self) -> None:
        self.client.stop_server()


def copy_no_overwrite(src: Path, dst: Path) -> None:
    if dst.exists():
        if file_sha256(dst) != file_sha256(src):
            raise FileExistsError(f"{dst} exists with different content; refusing to overwrite")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
