"""Compose the phase 1 demo scene from the chosen candidate of each asset."""
from __future__ import annotations

import json

from PIL import Image, ImageOps

from .config import Project, load_yaml
from .processing import upscale
from .state import State


def choose_candidates(state: State, asset_ids: list[str]) -> dict[str, dict]:
    """The reviewer's selection when there is one, otherwise the cleanest validated candidate."""
    chosen = {}
    for asset_id in asset_ids:
        review = state.review_summary(asset_id)
        rows = {c["id"]: c for c in state.candidates(asset_id) if c["sprite_path"]}
        valid = [c for c in rows.values() if c["status"] in ("validated", "approved")
                 and c["id"] not in review["rejected"]]
        if review["selected"] in rows:
            chosen[asset_id] = {"candidate": rows[review["selected"]], "by": "reviewer"}
        elif valid:
            best = min(valid, key=lambda c: (len(json.loads(c["qc"]).get("warnings", [])),
                                              json.loads(c["qc"]).get("orphan_ratio", 1), c["id"]))
            chosen[asset_id] = {"candidate": best, "by": "auto"}
    return chosen


def render_scene(project: Project, layout: dict, sprites: dict[str, Image.Image]) -> Image.Image:
    w, h = layout["width"], layout["height"]
    scene = Image.new("RGBA", (w, h), (24, 16, 12, 255))
    floor = sprites.get(layout["floor"])
    if floor is not None:
        for y in range(0, h, floor.height):
            for x in range(0, w, floor.width):
                scene.alpha_composite(floor, (x, y))
    # Painter's order: whatever stands lower on screen is closer to the camera.
    for obj in sorted(layout["objects"], key=lambda o: o["y"]):
        sprite = sprites.get(obj["asset"])
        if sprite is None:
            continue
        if obj.get("flip"):
            sprite = ImageOps.mirror(sprite)
        # Sprites are anchored bottom-center with `padding` px below the feet.
        x = obj["x"] - sprite.width // 2
        y = obj["y"] - sprite.height
        layer = Image.new("RGBA", scene.size)
        layer.paste(sprite, (x, y))
        scene = Image.alpha_composite(scene, layer)
    return scene


def build_validation_scene(project: Project, state: State) -> dict:
    layout = load_yaml(project.path("config", "scene_validation.yaml"))
    ids = sorted({layout["floor"], *(o["asset"] for o in layout["objects"])})
    chosen = choose_candidates(state, ids)
    sprites = {aid: Image.open(project.path(c["candidate"]["sprite_path"])).convert("RGBA")
               for aid, c in chosen.items()}
    scene = render_scene(project, layout, sprites)
    out = project.path("output", "validation")
    out.mkdir(parents=True, exist_ok=True)
    scene.save(out / "scene.png")
    upscale(scene, 4).save(out / "scene_x4.png")
    info = {"layout": layout, "missing": [a for a in ids if a not in chosen],
            "chosen": {aid: {"candidate_id": c["candidate"]["id"], "by": c["by"],
                             "sprite": c["candidate"]["sprite_path"]} for aid, c in chosen.items()}}
    (out / "scene.json").write_text(json.dumps(info, indent=2) + "\n")
    return info
