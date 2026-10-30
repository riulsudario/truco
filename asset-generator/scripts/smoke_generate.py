"""One real generation through ComfyUI, without the catalog or post-processing.

Used to prove the model stack runs on this GPU. Usage:
  .venv/bin/python scripts/smoke_generate.py OUT_DIR [REFERENCE_IMAGE]
"""
import shutil
import sys
import time
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from assetgen.comfy import ComfyClient  # noqa: E402
from assetgen.workflow import build_graph  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
settings = yaml.safe_load((ROOT / "config/settings.yaml").read_text())
style = yaml.safe_load((ROOT / "config/styles/world_topdown.yaml").read_text())
catalog = yaml.safe_load((ROOT / "catalogs/validation.yaml").read_text())
assets = {a["id"]: a for a in catalog["assets"]}

client = ComfyClient(ROOT, settings)
client.ensure_server(ROOT / "output/reports/comfyui.log")
ref_name = None
if len(sys.argv) > 2:
    ref_name = "assetgen_smoke_ref.png"
    shutil.copyfile(sys.argv[2], client.input_dir() / ref_name)

for asset_id in ["wooden_truco_table", "terracotta_floor"]:
    t = time.time()
    graph = build_graph(style=style, asset=assets[asset_id], seed=1234, width=1024, height=1024,
                        reference_image=ref_name)
    images = client.run(graph)
    for i, img in enumerate(images):
        img.save(out / f"{asset_id}_{i}.png")
        print(asset_id, i, img.size, img.mode, f"{time.time() - t:.1f}s", flush=True)
print(client.system_stats()["devices"][0])
