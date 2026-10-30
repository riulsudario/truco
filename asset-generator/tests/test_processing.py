import numpy as np
import pytest
from PIL import Image

from assetgen.processing import Palette, process_sprite, process_tile, seam_ratios, tile_preview
from conftest import blob_image


def setup(project, asset_id):
    style = project.style("world_topdown")
    asset = next(a for a in project.catalog("validation") if a["id"] == asset_id)
    return asset, style, Palette.from_style(style, project.root)


def test_sprite_has_exact_target_size_and_clean_alpha(project):
    asset, style, palette = setup(project, "wooden_truco_table")
    sprite, qc = process_sprite(blob_image(), asset, style, palette)
    assert qc["errors"] == []
    size = asset["target_size"]
    assert sprite.size == (size["width"], size["height"]) and sprite.mode == "RGBA"
    alpha = set(np.unique(np.array(sprite)[..., 3]).tolist())
    assert alpha <= {0, 255, int(palette.shadow[3])}


def test_sprite_keeps_proportions(project):
    asset, style, palette = setup(project, "wooden_truco_table")
    # A 424 x 360 object must keep its proportions in the target box.
    sprite, qc = process_sprite(blob_image(shadow=False), asset, style, palette)
    assert qc["aspect_error"] < 0.05
    w, h = qc["object_size"]
    assert abs(w / h - 424 / 360) < 0.05


def test_sprite_uses_only_palette_outline_and_shadow_colours(project):
    asset, style, palette = setup(project, "tropical_plant")
    sprite, _ = process_sprite(blob_image(colour=(37, 160, 80)), asset, style, palette)
    arr = np.array(sprite)
    solid = arr[arr[..., 3] == 255][:, :3]
    allowed = {tuple(c) for c in palette.colours} | {tuple(palette.outline)}
    assert {tuple(c) for c in solid} <= allowed


def test_sprite_is_anchored_bottom_center(project):
    asset, style, palette = setup(project, "character_male")
    sprite, qc = process_sprite(blob_image(box=(450, 200, 574, 800), shadow=False), asset, style, palette)
    alpha = np.array(sprite)[..., 3]
    rows = np.nonzero(alpha.any(1))[0]
    cols = np.nonzero(alpha.any(0))[0]
    assert rows.max() == sprite.height - 1  # outline sits in the 1 px padding
    assert abs((cols.min() + cols.max()) / 2 - (sprite.width - 1) / 2) <= 1
    h = asset["target_size"]["height"]
    assert qc["anchor"] == [0.5, round((h - 1) / h, 4)]


def test_cropped_object_is_flagged(project):
    asset, style, palette = setup(project, "wooden_chair")
    _, qc = process_sprite(blob_image(box=(0, 300, 600, 1024), shadow=False), asset, style, palette)
    assert any("frame edge" in e for e in qc["errors"])


def test_empty_and_opaque_images_fail(project):
    asset, style, palette = setup(project, "wooden_chair")
    empty = Image.new("RGBA", (1024, 1024))
    assert process_sprite(empty, asset, style, palette)[0] is None
    opaque = Image.new("RGBA", (1024, 1024), (120, 72, 40, 255))
    sprite, qc = process_sprite(opaque, asset, style, palette)
    assert sprite is None and "no background separation" in qc["errors"][0]


def test_two_objects_are_flagged(project):
    asset, style, palette = setup(project, "wooden_chair")
    a = np.array(blob_image(box=(100, 300, 400, 700), shadow=False))
    b = np.array(blob_image(box=(600, 300, 900, 700), shadow=False))
    _, qc = process_sprite(Image.fromarray(np.maximum(a, b), "RGBA"), asset, style, palette)
    assert any("multiple separate objects" in e for e in qc["errors"])


def test_small_fragments_are_removed_with_a_warning(project):
    asset, style, palette = setup(project, "wooden_chair")
    arr = np.array(blob_image(shadow=False))
    arr[100:104, 100:104] = (255, 255, 255, 255)
    _, qc = process_sprite(Image.fromarray(arr, "RGBA"), asset, style, palette)
    assert qc["errors"] == [] and any("stray" in w for w in qc["warnings"])


def periodic_texture(size=1024, period=128):
    y, x = np.mgrid[0:size, 0:size]
    grout = ((x % period) < 8) | ((y % period) < 8)
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    arr[...] = (190, 90, 50)
    arr[grout] = (80, 50, 40)
    return Image.fromarray(arr)


def test_periodic_tile_passes_seam_check(project):
    asset, style, palette = setup(project, "terracotta_floor")
    tile, qc = process_tile(periodic_texture(), asset, style, palette)
    size = asset["target_size"]
    assert qc["errors"] == [] and tile.size == (size["width"], size["height"])
    assert max(qc["seam_ratio"]) <= 1.6


def test_non_periodic_tile_is_flagged(project):
    asset, style, palette = setup(project, "terracotta_floor")
    ramp = np.zeros((1024, 1024, 3), dtype=np.uint8)
    ramp[..., 0] = np.linspace(0, 255, 1024, dtype=np.uint8)[None, :]
    ramp[..., 1] = np.linspace(0, 255, 1024, dtype=np.uint8)[:, None]
    _, qc = process_tile(Image.fromarray(ramp), asset, style, palette)
    assert any("seam" in e for e in qc["errors"])


def test_seam_ratio_measures_wrap_edge():
    flat = np.full((8, 8, 3), 100, dtype=np.uint8)
    flat[:, ::2] = 120
    assert seam_ratios(flat)[0] == pytest.approx(1.0)  # alternating columns: wrap jump equals interior jump


def test_tile_preview_is_a_5x5_nearest_upscale(project):
    tile = Image.new("RGBA", (32, 32), (10, 20, 30, 255))
    preview = tile_preview(tile, 5, 4)
    assert preview.size == (640, 640)
    assert set(np.unique(np.array(preview)[..., 0]).tolist()) == {10}


def test_tile_colours_are_limited(project):
    asset, style, palette = setup(project, "terracotta_floor")
    rng = np.random.default_rng(1)
    noisy = rng.integers(0, 255, (1024, 1024, 3), dtype=np.uint8)
    tile, qc = process_tile(Image.fromarray(noisy), asset, style, palette)
    assert qc["colours_used"] <= style["processing"]["tile_max_colours"]
