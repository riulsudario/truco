import json

import numpy as np
import pytest
from PIL import Image

from assetgen.spritesheet import Frame, pack, write_atlas, write_tileset


def solid(w, h, value):
    return Image.new("RGBA", (w, h), (value, value, value, 255))


def test_frames_do_not_overlap_and_match_their_pixels(tmp_path):
    frames = [Frame(f"f{i}", solid(w, h, 10 + i), "furniture", [0.5, 1.0], "x") for i, (w, h) in
              enumerate([(64, 48), (24, 36), (32, 48), (32, 48), (500, 20), (600, 10)])]
    sheet, data = pack(frames, max_width=700)
    boxes = []
    for i, f in enumerate(frames):
        r = data["frames"][f.id]["frame"]
        crop = np.array(sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])))
        assert (crop[..., 0] == 10 + i).all()
        assert data["frames"][f.id]["anchor"] == {"x": 0.5, "y": 1.0}
        assert data["frames"][f.id]["sourceSize"] == {"w": f.image.width, "h": f.image.height}
        boxes.append((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            assert a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1]


def test_atlas_files_are_phaser_json_hash(tmp_path):
    frames = [Frame("walk_0", solid(32, 48, 1), "characters", [0.5, 0.98], "x", animation="walk"),
              Frame("walk_1", solid(32, 48, 2), "characters", [0.5, 0.98], "x", animation="walk")]
    png, js = write_atlas(frames, tmp_path, "chars")
    data = json.loads(js.read_text())
    assert data["meta"]["image"] == "chars.png" and Image.open(png).mode == "RGBA"
    assert data["meta"]["animations"] == {"walk": ["walk_0", "walk_1"]}
    assert data["frames"]["walk_0"]["category"] == "characters"


def test_tileset_is_tiled_json(tmp_path):
    tiles = [Frame("floor_a", solid(32, 32, 5), "environment", [0, 0], "x"),
             Frame("floor_b", solid(32, 32, 6), "environment", [0, 0], "x")]
    png, tsj = write_tileset(tiles, tmp_path, "floors", 32)
    data = json.loads(tsj.read_text())
    assert data["type"] == "tileset" and data["tilecount"] == 2 and data["imagewidth"] == 64
    assert data["tiles"][1]["properties"][0]["value"] == "floor_b"
    with pytest.raises(ValueError):
        write_tileset([Frame("bad", solid(16, 32, 1), "environment", [0, 0], "x")], tmp_path, "bad", 32)
