"""Caminhos, configuração e utilidades compartilhadas pelos scripts do pipeline."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
OUTPUT = ROOT / "output"
CANDIDATES = OUTPUT / "candidates"
SELECTED = OUTPUT / "selected"
FINAL = OUTPUT / "final"
MANIFESTS = ROOT / "manifests"
REVIEW_FILE = MANIFESTS / "review.json"
MANIFEST_FILE = MANIFESTS / "audio_manifest.json"
MODELS = ROOT / "models"


def slugify(text: str) -> str:
    """Nome de arquivo estável: minúsculas, sem acento, sem pontuação, espaços viram _."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    words = re.findall(r"[a-z0-9]+", ascii_text.lower())
    return "_".join(words)


def load_yaml(name: str) -> dict:
    with open(CONFIG / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_lines() -> dict:
    with open(ROOT / "data" / "lines.json", encoding="utf-8") as f:
        data = json.load(f)
    for line in data["lines"]:
        line["slug"] = slugify(line["text"])
    return data


def characters() -> dict:
    return load_yaml("characters.yaml")["characters"]


def generation() -> dict:
    return load_yaml("generation.yaml")


def take_name(line: dict, variant: int) -> str:
    return f"{line['slug']}_{variant:02d}"


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def params_for(character: dict, line: dict, gen: dict, style: str | None = None) -> dict:
    """Padrões do modelo < personagem < categoria (ou estilo da fase B)."""
    params = dict(gen["defaults"])
    params.update(character.get("params") or {})
    if style:
        params.update(gen["styles"][style])
    else:
        params.update((character.get("by_category") or {}).get(line["category"], {}))
    return params


def spoken_text(character: dict, line: dict, lines: dict) -> str:
    """Texto enviado ao modelo: override do personagem > override global > original."""
    own = (character.get("tts_overrides") or {}).get(line["id"])
    return own or lines.get("tts_overrides", {}).get(line["id"]) or line["text"]


def seed_for(base: int, *parts: object) -> int:
    digest = hashlib.sha256(":".join([str(base), *map(str, parts)]).encode()).hexdigest()
    return int(digest[:8], 16)


def load_review() -> dict:
    if REVIEW_FILE.exists():
        return json.loads(REVIEW_FILE.read_text(encoding="utf-8"))
    return {"takes": {}}


def save_review(review: dict) -> None:
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    REVIEW_FILE.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"{tool} não encontrado no PATH")


def ffprobe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or f"ffprobe falhou em {path}")
    return json.loads(out.stdout)
