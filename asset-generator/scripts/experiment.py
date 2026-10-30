"""Run one asset through ComfyUI with style overrides, for tuning. Not part of the pipeline.

  .venv/bin/python scripts/experiment.py OUT_DIR ASSET_ID LABEL '{"style": {...}, "asset": {...}}' [SEEDS]
Set style.ip_adapter.enabled=false to run without the reference.
"""
import copy
import json
import sys
import time
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from assetgen.comfy import ComfyClient  # noqa: E402
from assetgen.config import Project  # noqa: E402
from assetgen.workflow import build_graph  # noqa: E402


def merge(base, over):
    out = copy.deepcopy(base)
    for k, v in over.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


out, asset_id, label, overrides = Path(sys.argv[1]), sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
seeds = [int(s) for s in (sys.argv[5] if len(sys.argv) > 5 else "1234").split(",")]
out.mkdir(parents=True, exist_ok=True)
settings = yaml.safe_load((ROOT / "config/settings.yaml").read_text())
style = merge(yaml.safe_load((ROOT / "config/styles/world_topdown.yaml").read_text()), overrides.get("style", {}))
assets = {a["id"]: a for a in yaml.safe_load((ROOT / "catalogs/validation.yaml").read_text())["assets"]}
asset = merge(assets[asset_id], overrides.get("asset", {}))
client = ComfyClient(ROOT, settings)
client.ensure_server(ROOT / "output/reports/comfyui.log")
from assetgen.generator import ComfyBackend  # noqa: E402
backend = ComfyBackend(Project(ROOT))
ref = None
if style.get("ip_adapter", {}).get("enabled", True):
    ref = backend.prepare_reference(ROOT / style["reference"], style["ip_adapter"].get("crops"))
for seed in seeds:
    t = time.time()
    img = client.run(build_graph(style=style, asset=asset, seed=seed, width=1024, height=1024, reference_image=ref))[0]
    path = out / f"{asset_id}_{label}_{seed}.png"
    img.save(path)
    print(path.name, img.mode, f"{time.time() - t:.1f}s", flush=True)
