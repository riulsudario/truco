import json
import shutil
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from assetgen.config import Project
from assetgen.processing import extract_palette

REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def project(tmp_path: Path) -> Project:
    """A copy of the real config and catalogs, with a synthetic reference and palette."""
    for d in ("config", "catalogs", "preview"):
        shutil.copytree(REPO / d, tmp_path / d, ignore=shutil.ignore_patterns("*.palette.json"))
    (tmp_path / "references").mkdir()
    rng = np.random.default_rng(0)
    ref = rng.integers(0, 255, (64, 64, 3), dtype=np.uint8)
    ref[:32, :32] = (120, 72, 40)
    ref[32:, 32:] = (190, 90, 50)
    for name in ("world", "table"):
        Image.fromarray(ref).save(tmp_path / "references" / f"{name}.png")
    proj = Project(tmp_path)
    for sid in proj.style_ids():
        style = proj.style(sid)
        colours = extract_palette(proj.path(style["reference"]), 16, style["palette"].get("extra", []))
        proj.path(style["palette"]["file"]).write_text(json.dumps({"colours": colours}))
    return proj


def blob_image(size=1024, box=(300, 400, 724, 760), colour=(120, 72, 40), shadow=True) -> Image.Image:
    """A transparent canvas with one solid object and an optional soft shadow under it."""
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    x0, y0, x1, y1 = box
    if shadow:
        arr[y1 - 10:y1 + 30, x0 + 20:x1 + 40] = (10, 10, 10, 90)
    arr[y0:y1, x0:x1] = (*colour, 255)
    arr[y0:y0 + 40, x0:x1] = (190, 90, 50, 255)
    return Image.fromarray(arr, "RGBA")
