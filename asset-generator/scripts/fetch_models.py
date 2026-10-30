"""Download model weights into the Hugging Face cache and link them into ComfyUI.

Weights stay in ~/.cache/huggingface; comfyui/models/* only holds symlinks, so
re-running is cheap and nothing is downloaded twice.
"""
import hashlib
import json
import sys
from pathlib import Path

import yaml
from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "comfyui" / "models"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    config = yaml.safe_load((ROOT / "config" / "models.yaml").read_text())
    lock_path = ROOT / "config" / "models.lock.json"
    lock = json.loads(lock_path.read_text()) if lock_path.exists() else {}
    for key, spec in config["weights"].items():
        cached = Path(hf_hub_download(spec["repo"], spec["file"], revision=spec.get("revision")))
        target = MODELS / spec["folder"] / spec["name"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_symlink() or target.exists():
            target.unlink()
        target.symlink_to(cached.resolve())
        if key not in lock or lock[key].get("path") != str(cached.resolve()):
            lock[key] = {"repo": spec["repo"], "file": spec["file"], "path": str(cached.resolve()),
                         "sha256": sha256(cached), "license": spec["license"]}
        print(f"{key}: {target} -> {lock[key]['sha256'][:12]}", flush=True)
    lock_path.write_text(json.dumps(lock, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
