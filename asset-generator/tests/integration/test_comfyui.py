"""Real generation through ComfyUI on the local GPU. Run with `pytest -m integration`.

Skips with an explicit reason when ComfyUI, a weight or the GPU is missing, so a
skipped run is never mistaken for a passing one.
"""
import pytest
import yaml

from assetgen.config import Project
from assetgen.processing import Palette, process_sprite, process_tile
from conftest import REPO

pytestmark = pytest.mark.integration


def missing_dependency() -> str | None:
    try:
        import torch
    except ImportError:
        return "torch not installed"
    if not torch.cuda.is_available():
        return "CUDA GPU not available"
    if not (REPO / "comfyui" / "main.py").exists():
        return "ComfyUI checkout missing (comfyui/)"
    weights = yaml.safe_load((REPO / "config" / "models.yaml").read_text())["weights"]
    for key, spec in weights.items():
        if not (REPO / "comfyui" / "models" / spec["folder"] / spec["name"]).exists():
            return f"weight {key} missing; run scripts/fetch_models.py"
    return None


@pytest.fixture(scope="module")
def backend():
    reason = missing_dependency()
    if reason:
        pytest.skip(f"external dependency unavailable: {reason}")
    from assetgen.generator import ComfyBackend
    b = ComfyBackend(Project(REPO))
    yield b
    b.finish()
    b.stop()


@pytest.mark.parametrize("asset_id", ["wooden_truco_table", "terracotta_floor"])
def test_real_generation_produces_a_usable_asset(backend, asset_id):
    from assetgen.workflow import build_graph
    project = Project(REPO)
    style = project.style("world_topdown")
    asset = next(a for a in project.catalog("validation") if a["id"] == asset_id)
    ref = project.path(style["reference"])
    ref_name = backend.prepare_reference(ref, style["ip_adapter"].get("crops")) if ref.exists() else None
    raw = backend.generate(build_graph(style=style, asset=asset, seed=7, width=1024, height=1024,
                                       reference_image=ref_name))
    assert raw.size == (1024, 1024)
    if not project.path(style["palette"]["file"]).exists():
        pytest.skip("palette missing; run `generate.py palette` to check post-processing too")
    palette = Palette.from_style(style, project.root)
    if asset["kind"] == "tile":
        assert raw.mode == "RGB"
        tile, qc = process_tile(raw, asset, style, palette)
        assert tile.size == (32, 32)
    else:
        assert raw.mode == "RGBA", "LayerDiffuse should return an alpha channel"
        sprite, qc = process_sprite(raw, asset, style, palette)
        size = asset["target_size"]
        assert sprite is None or sprite.size == (size["width"], size["height"])
    # QC may legitimately reject a seed; the point here is that the stack runs end to end.
    assert "errors" in qc
