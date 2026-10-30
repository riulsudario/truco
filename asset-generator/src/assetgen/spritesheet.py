"""Pack sprites into a Phaser atlas (JSON Hash) and tiles into a Tiled tileset.

Phaser 3 reads `anchor` from each frame as its custom pivot, so sprites placed
with `this.add.image(x, y, atlas, id)` stand on (x, y) without extra setup.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image


@dataclass
class Frame:
    id: str
    image: Image.Image
    category: str
    anchor: list[float]
    source: str
    animation: str | None = None
    extra: dict = field(default_factory=dict)


def pack(frames: list[Frame], max_width: int = 1024, gap: int = 2) -> tuple[Image.Image, dict]:
    """Shelf packing, tallest first. `gap` transparent pixels avoid bleeding when Phaser filters."""
    order = sorted(frames, key=lambda f: (-f.image.height, f.id))
    x = y = shelf_h = 0
    width = 0
    placed = {}
    for f in order:
        w, h = f.image.size
        if w > max_width:
            raise ValueError(f"{f.id} is wider ({w}) than the sheet ({max_width})")
        if x + w > max_width:
            x, y, shelf_h = 0, y + shelf_h + gap, 0
        placed[f.id] = (x, y)
        x += w + gap
        shelf_h = max(shelf_h, h)
        width = max(width, x - gap)
    height = y + shelf_h
    sheet = Image.new("RGBA", (max(width, 1), max(height, 1)), (0, 0, 0, 0))
    data = {"frames": {}, "meta": {"app": "truco asset-generator", "version": "1", "format": "RGBA8888",
                                     "size": {"w": sheet.width, "h": sheet.height}, "scale": "1",
                                     "animations": {}}}
    for f in frames:
        px, py = placed[f.id]
        sheet.paste(f.image, (px, py))
        w, h = f.image.size
        data["frames"][f.id] = {
            "frame": {"x": px, "y": py, "w": w, "h": h},
            "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
            "anchor": {"x": f.anchor[0], "y": f.anchor[1]},
            "category": f.category, "source": f.source, **f.extra,
        }
        if f.animation:
            data["meta"]["animations"].setdefault(f.animation, []).append(f.id)
    return sheet, data


def write_atlas(frames: list[Frame], out_dir: Path, name: str) -> tuple[Path, Path]:
    sheet, data = pack(frames)
    out_dir.mkdir(parents=True, exist_ok=True)
    png, js = out_dir / f"{name}.png", out_dir / f"{name}.json"
    data["meta"]["image"] = png.name
    sheet.save(png)
    js.write_text(json.dumps(data, indent=2) + "\n")
    return png, js


def write_tileset(tiles: list[Frame], out_dir: Path, name: str, tile_size: int) -> tuple[Path, Path]:
    """A Tiled 1.10+ JSON tileset (.tsj) backed by one image strip."""
    for t in tiles:
        if t.image.size != (tile_size, tile_size):
            raise ValueError(f"{t.id} is {t.image.size}, expected {tile_size}x{tile_size}")
    strip = Image.new("RGBA", (tile_size * len(tiles), tile_size))
    for i, t in enumerate(tiles):
        strip.paste(t.image, (i * tile_size, 0))
    out_dir.mkdir(parents=True, exist_ok=True)
    png, tsj = out_dir / f"{name}.png", out_dir / f"{name}.tsj"
    strip.save(png)
    tsj.write_text(json.dumps({
        "type": "tileset", "version": "1.10", "tiledversion": "1.10.2", "name": name,
        "image": png.name, "imagewidth": strip.width, "imageheight": strip.height,
        "tilewidth": tile_size, "tileheight": tile_size, "tilecount": len(tiles), "columns": len(tiles),
        "margin": 0, "spacing": 0,
        "tiles": [{"id": i, "properties": [{"name": "asset_id", "type": "string", "value": t.id}]}
                  for i, t in enumerate(tiles)],
    }, indent=2) + "\n")
    return png, tsj
