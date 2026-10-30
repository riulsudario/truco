#!/usr/bin/env python3
"""Pixel art asset generator for the truco game.

  python generate.py doctor            check GPU, ComfyUI, nodes, weights, references
  python generate.py palette           extract each profile's palette from its reference
  python generate.py validate          generate the six phase 1 assets (never more)
  python generate.py reprocess         redo the downscale of candidates made at an older target size
  python generate.py preview           serve the review page on localhost
  python generate.py approve           record the reviewer's selections and freeze the style
  python generate.py production        generate every production catalog (needs approval)
  python generate.py category NAME     generate one production catalog (needs approval)
  python generate.py resume            continue an interrupted run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from assetgen.approval import ApprovalError, approve, require_approval  # noqa: E402
from assetgen.config import ConfigError, Project, file_sha256  # noqa: E402
from assetgen.state import State  # noqa: E402

VALIDATION = "validation"


def open_state(project: Project) -> State:
    return State(project.path(project.settings["paths"]["state_db"]))


def production_catalogs(project: Project) -> list[str]:
    return [c for c in project.catalog_names() if c != VALIDATION]


# -- doctor ---------------------------------------------------------------
def cmd_doctor(project: Project, args) -> int:
    results: list[tuple[str, bool, str]] = []

    def check(name, fn):
        try:
            ok, detail = fn()
        except Exception as err:  # noqa: BLE001 - doctor reports every failure
            ok, detail = False, f"{type(err).__name__}: {err}"
        results.append((name, ok, detail))

    check("python", lambda: (sys.version_info[:2] >= (3, 10), sys.version.split()[0]))

    def torch_check():
        import torch
        if not torch.cuda.is_available():
            return False, f"torch {torch.__version__} without CUDA"
        free, total = torch.cuda.mem_get_info()
        return total >= 7.5 * 2**30, (f"torch {torch.__version__}, {torch.cuda.get_device_name(0)}, "
                                      f"{total / 2**30:.1f} GiB VRAM ({free / 2**30:.1f} free)")
    check("torch + CUDA", torch_check)

    def driver():
        out = subprocess.run(["nvidia-smi", "--query-gpu=driver_version,memory.total,memory.used",
                              "--format=csv,noheader"], capture_output=True, text=True, timeout=10)
        return out.returncode == 0, out.stdout.strip() or out.stderr.strip()
    check("nvidia driver", driver)

    def packages():
        import numpy, PIL, scipy, yaml  # noqa: E401,F401
        return True, f"numpy {numpy.__version__}, pillow {PIL.__version__}, scipy {scipy.__version__}"
    check("python packages", packages)

    cfg = project.settings["comfyui"]
    comfy_dir = project.path(cfg["dir"])

    def git_head(path: Path) -> str:
        return subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True,
                              text=True).stdout.strip()

    check("ComfyUI checkout", lambda: (git_head(comfy_dir) == cfg["commit"],
                                       f"{git_head(comfy_dir)[:12]} (pinned {cfg['commit'][:12]})"))
    for name, node in cfg["custom_nodes"].items():
        path = comfy_dir / "custom_nodes" / name

        def node_check(path=path, node=node, name=name):
            head = git_head(path)
            patch = project.path("patches", f"{name}.patch")
            detail = f"{head[:12]}"
            if patch.exists():
                applied = subprocess.run(["git", "-C", str(path), "apply", "--reverse", "--check", str(patch)],
                                         capture_output=True).returncode == 0
                detail += ", local patch " + ("applied" if applied else "NOT applied")
                if not applied:
                    return False, detail
            return head == node["commit"], detail
        check(f"node {name}", node_check)

    lock_path = project.path("config", "models.lock.json")
    lock = json.loads(lock_path.read_text()) if lock_path.exists() else {}
    import yaml
    models = yaml.safe_load(project.path("config", "models.yaml").read_text())["weights"]
    for key, spec in models.items():
        target = comfy_dir / "models" / spec["folder"] / spec["name"]

        def weight_check(target=target, key=key, spec=spec):
            if not target.exists():
                return False, f"missing {target}; run scripts/fetch_models.py"
            detail = f"{target.stat().st_size / 2**20:.0f} MiB, {spec['license']}"
            if args.hashes:
                ok = file_sha256(target) == lock.get(key, {}).get("sha256")
                return ok, detail + (", sha256 ok" if ok else ", sha256 MISMATCH")
            return True, detail
        check(f"weight {key}", weight_check)

    for sid in project.style_ids():
        style = project.style(sid)
        ref = project.path(style["reference"])
        pal = project.path(style["palette"]["file"])
        check(f"reference {sid}", lambda ref=ref: (ref.exists(), str(ref.relative_to(project.root))
                                                    + ("" if ref.exists() else " missing")))
        check(f"palette {sid}", lambda pal=pal: (pal.exists(), "ok" if pal.exists()
                                                  else "missing; run `generate.py palette`"))

    def catalogs():
        names = project.catalog_names()
        counts = {n: len(project.catalog(n)) for n in names}
        return True, ", ".join(f"{n}={c}" for n, c in counts.items())
    check("catalogs", catalogs)

    def disk():
        import shutil
        free = shutil.disk_usage(project.root).free / 2**30
        return free > 5, f"{free:.0f} GiB free"
    check("disk", disk)

    if args.server:
        from assetgen.comfy import ComfyClient
        client = ComfyClient(project.root, project.settings)

        def server():
            client.ensure_server(project.path("output", "reports", "comfyui.log"))
            dev = client.system_stats()["devices"][0]
            return True, f"{dev['name']}, vram free {dev['vram_free'] / 2**30:.1f} GiB"
        check("ComfyUI server", server)

    width = max(len(n) for n, _, _ in results)
    for name, ok, detail in results:
        print(f"{'OK  ' if ok else 'FAIL'} {name:<{width}}  {detail}")
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


# -- palette --------------------------------------------------------------
def cmd_palette(project: Project, args) -> int:
    from assetgen.processing import extract_palette
    for sid in project.style_ids():
        style = project.style(sid)
        ref = project.path(style["reference"])
        out = project.path(style["palette"]["file"])
        if not ref.exists():
            print(f"{sid}: reference {ref.relative_to(project.root)} missing, skipped")
            continue
        if out.exists() and not args.force:
            data = json.loads(out.read_text())
            if data.get("reference_sha256") == file_sha256(ref):
                print(f"{sid}: palette up to date ({len(data['colours'])} colours)")
                continue
        colours = extract_palette(ref, style["palette"]["size"], style["palette"].get("extra", []))
        out.write_text(json.dumps({"reference": style["reference"], "reference_sha256": file_sha256(ref),
                                   "colours": colours}, indent=2) + "\n")
        print(f"{sid}: wrote {len(colours)} colours to {out.relative_to(project.root)}")
    return 0


# -- generation -----------------------------------------------------------
def run_generation(project: Project, state: State, assets: list[dict], new_round: bool, command: str) -> dict:
    from assetgen.generator import ComfyBackend, Generator
    backend = ComfyBackend(project)
    gen = Generator(project, state, backend)
    gen.plan(assets, new_round=new_round)
    run_id = state.start_run(command)
    try:
        stats = gen.run(assets)
    finally:
        if not project.settings["comfyui"].get("keep_server", False):
            backend.stop()
    state.finish_run(run_id, stats)
    return stats


def write_report(project: Project, state: State, assets: list[dict], stats: dict, name: str) -> Path:
    import platform
    import torch
    peaks = []
    for asset in assets:
        validated = 0
        for c in state.candidates(asset["id"]):
            meta = json.loads(c["meta"])
            if meta.get("vram_peak_mib"):
                peaks.append(meta["vram_peak_mib"])
            validated += c["status"] in ("validated", "approved")
        stats["per_asset"].setdefault(asset["id"], {"seconds": 0, "attempts": 0})["validated"] = validated
    lock_path = project.path("config", "models.lock.json")
    report = stats | {
        "finished_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "vram_peak_mib": max(peaks) if peaks else None,
        "environment": {
            "platform": platform.platform(), "python": platform.python_version(), "torch": torch.__version__,
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "comfyui_commit": project.settings["comfyui"]["commit"],
            "custom_nodes": {k: v["commit"] for k, v in project.settings["comfyui"]["custom_nodes"].items()},
            "weights": json.loads(lock_path.read_text()) if lock_path.exists() else {},
            "styles": {a["style"]: file_sha256(project.style_path(a["style"])) for a in assets},
        },
    }
    out = project.path("output", "reports", f"{name}_report.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    return out


def write_manifest(project: Project, state: State, assets: list[dict], path: Path) -> None:
    manifest = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "assets": {}}
    for asset in assets:
        row = state.asset(asset["id"])
        manifest["assets"][asset["id"]] = {
            "status": row["status"] if row else "pending",
            "review": state.review_summary(asset["id"]),
            "candidates": [{"id": c["id"], "round": c["round"], "slot": c["slot"], "attempt": c["attempt"],
                            "seed": c["seed"], "status": c["status"], "sprite": c["sprite_path"],
                            "raw": c["raw_path"], "errors": json.loads(c["qc"]).get("errors", []),
                            "warnings": json.loads(c["qc"]).get("warnings", [])}
                           for c in state.candidates(asset["id"])],
        }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def finish_validation(project: Project, state: State, assets: list[dict], stats: dict) -> None:
    from assetgen.scene import build_validation_scene
    report = write_report(project, state, assets, stats, VALIDATION)
    write_manifest(project, state, assets, project.path("output", "validation", "manifest.json"))
    scene = build_validation_scene(project, state)
    print(f"\nreport: {report.relative_to(project.root)}")
    print("scene: output/validation/scene_x4.png" + (f" (missing: {', '.join(scene['missing'])})"
                                                    if scene["missing"] else ""))
    print("next: python generate.py preview, then review. Production stays blocked until approval.")


def cmd_validate(project: Project, args) -> int:
    assets = project.catalog(VALIDATION)
    if args.assets:
        wanted = set(args.assets.split(","))
        unknown = wanted - {a["id"] for a in assets}
        if unknown:
            print(f"unknown validation asset(s): {', '.join(sorted(unknown))}")
            return 2
        assets = [a for a in assets if a["id"] in wanted]
    for style_id in {a["style"] for a in assets}:
        style = project.style(style_id)
        for key in ("reference", ):
            if not project.path(style[key]).exists():
                print(f"{style_id}: {style[key]} missing. Put the reference image there first.")
                return 2
        if not project.path(style["palette"]["file"]).exists():
            print(f"{style_id}: palette missing; run `python generate.py palette`")
            return 2
    state = open_state(project)
    try:
        stats = run_generation(project, state, assets, args.new_round, "validate")
        finish_validation(project, state, project.catalog(VALIDATION), stats)
    finally:
        state.close()
    print(json.dumps({k: v for k, v in stats.items() if k != "per_asset"}))
    return 0


def cmd_production(project: Project, args, only: str | None = None) -> int:
    state = open_state(project)
    try:
        names = production_catalogs(project)
        if only:
            if only not in names:
                print(f"unknown production catalog {only!r}; available: {', '.join(names) or 'none yet'}")
                return 2
            names = [only]
        assets = [a for n in names for a in project.catalog(n)]
        styles = sorted({a["style"] for a in assets}) or ["world_topdown"]
        try:
            approval = require_approval(project, state, styles)
        except ApprovalError as err:
            print(f"production blocked: {err}")
            return 3
        if not assets:
            print("no production catalog yet; it is prepared after the style approval")
            return 0
        print(f"approval from {time.strftime('%Y-%m-%d %H:%M', time.localtime(approval['at']))} is valid")
        stats = run_generation(project, state, assets, False, "production" if not only else f"category {only}")
        write_report(project, state, assets, stats, "production" if not only else f"category_{only}")
        write_manifest(project, state, assets, project.path("output", "production", "manifest.json"))
    finally:
        state.close()
    print(json.dumps({k: v for k, v in stats.items() if k != "per_asset"}))
    return 0


def cmd_resume(project: Project, args) -> int:
    state = open_state(project)
    try:
        requeued = state.reset_in_flight()
        pending = {c["asset_id"] for c in state.candidates(status="pending")}
        print(f"requeued {requeued} interrupted candidate(s); {len(pending)} asset(s) with pending work")
        if not pending:
            return 0
        validation = [a for a in project.catalog(VALIDATION) if a["id"] in pending]
        production = [a for n in production_catalogs(project) for a in project.catalog(n) if a["id"] in pending]
        if production:
            try:
                require_approval(project, state, sorted({a["style"] for a in production}))
            except ApprovalError as err:
                print(f"production assets left pending: {err}")
                production = []
        assets = validation + production
        if assets:
            stats = run_generation(project, state, assets, False, "resume")
            if validation:
                finish_validation(project, state, project.catalog(VALIDATION), stats)
            print(json.dumps({k: v for k, v in stats.items() if k != "per_asset"}))
    finally:
        state.close()
    return 0


def cmd_reprocess(project: Project, args) -> int:
    from assetgen.generator import Generator
    assets = project.catalog(VALIDATION) + [a for n in production_catalogs(project) for a in project.catalog(n)]
    if args.assets:
        wanted = set(args.assets.split(","))
        unknown = wanted - {a["id"] for a in assets}
        if unknown:
            print(f"unknown asset(s): {', '.join(sorted(unknown))}")
            return 2
        assets = [a for a in assets if a["id"] in wanted]
    state = open_state(project)
    try:
        # No backend: reprocessing only reads the raw images already on disk.
        done = Generator(project, state, backend=None).reprocess(assets)
        for d in done:
            print(f"  #{d['id']:<4} {d['asset_id']:<22} {'ok' if d['ok'] else 'FAILED'}  {d['from']} -> {d['sprite']}"
                  f"{'  warn: ' + '; '.join(d['warnings']) if d['warnings'] else ''}")
        validation = [a for a in assets if a["catalog"] == VALIDATION]
        if done and validation:
            from assetgen.scene import build_validation_scene
            write_manifest(project, state, project.catalog(VALIDATION),
                           project.path("output", "validation", "manifest.json"))
            build_validation_scene(project, state)
    finally:
        state.close()
    print(f"reprocessed {len(done)} candidate(s)")
    return 0


def cmd_preview(project: Project, args) -> int:
    from assetgen.preview_server import serve
    cfg = project.settings["preview"]
    serve(project, project.path(project.settings["paths"]["state_db"]), cfg["host"], args.port or cfg["port"])
    return 0


def cmd_scene(project: Project, args) -> int:
    from assetgen.scene import build_validation_scene
    state = open_state(project)
    try:
        info = build_validation_scene(project, state)
    finally:
        state.close()
    print(json.dumps(info["chosen"], indent=2))
    return 0


def cmd_approve(project: Project, args) -> int:
    from assetgen.approval import pending_selections
    state = open_state(project)
    try:
        assets = project.catalog(VALIDATION)
        chosen, problems = pending_selections(project, state, assets)
        for asset in assets:
            cand = chosen.get(asset["id"])
            print(f"  {asset['id']:<22} {'#' + str(cand['id']) + ' ' + cand['sprite_path'] if cand else '-'}")
        if problems:
            print("cannot approve:\n  " + "\n  ".join(problems))
            return 2
        if not args.yes:
            answer = input("Type 'aprovo' to approve these selections and freeze the style: ").strip().lower()
            if answer != "aprovo":
                print("not approved")
                return 1
        payload = approve(project, state, assets, args.note)
    finally:
        state.close()
    print(f"approved; frozen copy in {payload['frozen_dir']}, sprites in output/approved/sprites")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("doctor")
    p.add_argument("--hashes", action="store_true", help="verify sha256 of every weight (slow)")
    p.add_argument("--server", action="store_true", help="also start ComfyUI and query it")
    p = sub.add_parser("palette")
    p.add_argument("--force", action="store_true")
    p = sub.add_parser("validate")
    p.add_argument("--assets", help="comma separated ids, to regenerate only some assets")
    p.add_argument("--new-round", action="store_true", help="add a new round of candidates (old ones are kept)")
    p = sub.add_parser("reprocess")
    p.add_argument("--assets", help="comma separated ids, to reprocess only some assets")
    p = sub.add_parser("preview")
    p.add_argument("--port", type=int)
    sub.add_parser("scene")
    p = sub.add_parser("approve")
    p.add_argument("--yes", action="store_true", help="skip the typed confirmation")
    p.add_argument("--note")
    sub.add_parser("production")
    p = sub.add_parser("category")
    p.add_argument("name")
    sub.add_parser("resume")
    args = parser.parse_args(argv)

    project = Project(ROOT)
    try:
        if args.command == "category":
            return cmd_production(project, args, only=args.name)
        return {"doctor": cmd_doctor, "palette": cmd_palette, "validate": cmd_validate, "preview": cmd_preview,
                "scene": cmd_scene, "approve": cmd_approve, "production": cmd_production,
                "resume": cmd_resume, "reprocess": cmd_reprocess}[args.command](project, args)
    except (ConfigError, ApprovalError) as err:
        print(f"error: {err}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
