"""Style approval: freeze the visual profile and gate production on it."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from .config import Project, file_sha256
from .generator import copy_no_overwrite
from .processing import upscale
from .spritesheet import Frame, write_atlas, write_tileset
from .state import State
from .workflow import WORKFLOW_VERSION

PHASE = "style"


class ApprovalError(RuntimeError):
    pass


def fingerprint(project: Project, style_ids: list[str]) -> dict:
    """Hashes of everything that defines the look; production must match them exactly."""
    styles = {}
    for sid in style_ids:
        style = project.style(sid)
        palette = project.path(style["palette"]["file"])
        reference = project.path(style["reference"])
        styles[sid] = {
            "profile_sha256": file_sha256(project.style_path(sid)),
            "palette_sha256": file_sha256(palette) if palette.exists() else None,
            "reference_sha256": file_sha256(reference) if reference.exists() else None,
        }
    lock = project.path("config", "models.lock.json")
    cfg = project.settings["comfyui"]
    return {
        "styles": styles,
        "models_lock_sha256": file_sha256(lock) if lock.exists() else None,
        "workflow_version": WORKFLOW_VERSION,
        "comfyui_commit": cfg["commit"],
        "custom_nodes": {k: v["commit"] for k, v in cfg["custom_nodes"].items()},
    }


def pending_selections(project: Project, state: State, assets: list[dict]) -> tuple[dict, list[str]]:
    chosen, problems = {}, []
    for asset in assets:
        review = state.review_summary(asset["id"])
        cid = review["selected"]
        if cid is None:
            problems.append(f"{asset['id']}: no candidate selected in the preview")
            continue
        cand = state.candidate(cid)
        if cand["status"] not in ("validated", "approved") or not cand["sprite_path"]:
            problems.append(f"{asset['id']}: selected candidate #{cid} is {cand['status']}")
            continue
        chosen[asset["id"]] = cand
    return chosen, problems


def approve(project: Project, state: State, assets: list[dict], note: str | None) -> dict:
    chosen, problems = pending_selections(project, state, assets)
    if problems:
        raise ApprovalError("cannot approve:\n  " + "\n  ".join(problems))
    style_ids = sorted({a["style"] for a in assets})
    out = project.path("output", "approved")
    # One frozen copy of the profile per approval; earlier approvals stay untouched.
    frozen_root = out / "frozen"
    frozen_root.mkdir(parents=True, exist_ok=True)
    frozen = frozen_root / f"{len(list(frozen_root.iterdir())) + 1:03d}-{time.strftime('%Y%m%d-%H%M%S')}"
    frozen.mkdir()
    for sid in style_ids:
        style = project.style(sid)
        for src in (project.style_path(sid), project.path(style["palette"]["file"]),
                    project.path(style["reference"])):
            shutil.copy2(src, frozen / src.name)
    lock = project.path("config", "models.lock.json")
    if lock.exists():
        shutil.copy2(lock, frozen / lock.name)

    by_id = {a["id"]: a for a in assets}
    selections, sprites, tiles = {}, [], []
    for asset_id, cand in chosen.items():
        src = project.path(cand["sprite_path"])
        sha = file_sha256(src)
        dst = out / "sprites" / f"{asset_id}.png"
        if dst.exists() and file_sha256(dst) != sha:
            # Never overwrite an approved file: keep the old one under its hash.
            dst = out / "sprites" / f"{asset_id}.{sha[:12]}.png"
        copy_no_overwrite(src, dst)
        upscale(project_image(src), 8).save(dst.with_name(dst.stem + "_x8.png"))
        meta = json.loads(cand["meta"])
        qc = json.loads(cand["qc"])
        (dst.with_suffix(".json")).write_text(json.dumps(
            {k: v for k, v in meta.items() if k != "graph"} | {"qc": qc, "candidate_id": cand["id"]}, indent=2) + "\n")
        selections[asset_id] = {"candidate_id": cand["id"], "seed": cand["seed"], "sprite_sha256": sha,
                                "file": str(dst.relative_to(project.root))}
        frame = Frame(asset_id, project_image(src), by_id[asset_id]["category"], qc.get("anchor", [0.5, 1.0]),
                      str(dst.relative_to(project.root)))
        (tiles if by_id[asset_id]["kind"] == "tile" else sprites).append(frame)
        state.set_asset_status(asset_id, "approved", f"candidate #{cand['id']} approved")

    if sprites:
        write_atlas(sprites, out / "atlas", "validation")
    if tiles:
        write_tileset(tiles, out / "atlas", "validation_tiles", tiles[0].image.width)
    for name in ("scene.png", "scene_x4.png", "scene.json"):
        src = project.path("output", "validation", name)
        if src.exists():
            shutil.copy2(src, out / name)

    payload = {"fingerprint": fingerprint(project, style_ids), "selections": selections, "note": note,
               "frozen_dir": str(frozen.relative_to(project.root))}
    state.add_approval(PHASE, payload)
    (out / "approval.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


def project_image(path: Path):
    from PIL import Image
    return Image.open(path).convert("RGBA")


def require_approval(project: Project, state: State, style_ids: list[str]) -> dict:
    """Raise unless a style approval exists and nothing that defines the look changed since."""
    approval = state.latest_approval(PHASE)
    if approval is None:
        raise ApprovalError("no style approval recorded; run validation, review it and approve first")
    frozen = approval["fingerprint"]
    missing = [s for s in style_ids if s not in frozen["styles"]]
    if missing:
        raise ApprovalError(f"style profile(s) {', '.join(missing)} were never approved")
    current = fingerprint(project, style_ids)
    changed = []
    for sid in style_ids:
        for key, value in current["styles"][sid].items():
            if frozen["styles"][sid].get(key) != value:
                changed.append(f"{sid}.{key}")
    for key in ("models_lock_sha256", "workflow_version", "comfyui_commit", "custom_nodes"):
        if frozen.get(key) != current[key]:
            changed.append(key)
    if changed:
        raise ApprovalError("approved configuration changed since approval: " + ", ".join(changed)
                            + "; re-run validation and approve again")
    return approval
