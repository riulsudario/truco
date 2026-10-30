#!/usr/bin/env bash
# Reproducible install: ComfyUI and custom nodes at the pinned commits, local
# patches, an isolated venv and the model weights. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."


checkout() { # dir url commit
  if [ ! -d "$1/.git" ]; then git clone "$2" "$1"; fi
  git -C "$1" fetch --quiet origin "$3" 2>/dev/null || git -C "$1" fetch --quiet origin
  git -C "$1" checkout --quiet "$3"
}

command -v uv >/dev/null || { echo "uv is required (https://docs.astral.sh/uv/)"; exit 1; }
[ -d .venv ] || uv venv --python 3.11 .venv
export VIRTUAL_ENV="$PWD/.venv"
uv pip install --quiet pyyaml
PY=.venv/bin/python

checkout comfyui https://github.com/comfyanonymous/ComfyUI.git "$($PY -c "import yaml; print(yaml.safe_load(open('config/settings.yaml'))['comfyui']['commit'])")"
$PY - <<'PYEOF' | while read -r name url commit; do
import yaml
for name, node in yaml.safe_load(open("config/settings.yaml"))["comfyui"]["custom_nodes"].items():
    print(name, node["url"], node["commit"])
PYEOF
  dir="comfyui/custom_nodes/$name"
  checkout "$dir" "$url" "$commit"
  patch="patches/$name.patch"
  if [ -f "$patch" ] && ! git -C "$dir" apply --reverse --check "$PWD/$patch" 2>/dev/null; then
    git -C "$dir" apply "$PWD/$patch"
    echo "applied $patch"
  fi
done

uv pip install --quiet torch==2.11.0 torchvision==0.26.0 --index-url https://download.pytorch.org/whl/cu128
uv pip install --quiet -r comfyui/requirements.txt -r requirements.txt
$PY scripts/fetch_models.py
$PY generate.py doctor || true
