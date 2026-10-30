"""Cria uma referência sintética para o personagem, sem pessoa real: fala um texto em pt-BR com
o Kokoro-82M (Apache-2.0, local), numa voz que mistura voicepacks dele (bloco `synthetic` em
characters.yaml). Serve para apresentar o elenco enquanto não houver gravações autorizadas; a
gravação de verdade substitui o arquivo com prepare_reference.py.

Roda na venv própria (.venv-kokoro, torch CPU), para não misturar dependências com o Chatterbox:

    .venv-kokoro/bin/python scripts/invent_reference.py            # todos com bloco synthetic
    .venv-kokoro/bin/python scripts/invent_reference.py tonhao
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import yaml

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "output" / "synthetic"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("characters", nargs="*")
    args = parser.parse_args()

    from kokoro import KPipeline

    cast = yaml.safe_load((ROOT / "config" / "characters.yaml").read_text())["characters"]
    chosen = args.characters or [cid for cid, c in cast.items() if c.get("synthetic")]
    pipeline = KPipeline(lang_code="p", repo_id="hexgrad/Kokoro-82M")
    RAW.mkdir(parents=True, exist_ok=True)
    for cid in chosen:
        spec = cast[cid].get("synthetic")
        if not spec:
            raise SystemExit(f"{cid} não tem bloco synthetic em characters.yaml")
        total = sum(spec["blend"].values())
        voice = sum(w / total * pipeline.load_voice(name) for name, w in spec["blend"].items())
        torch.manual_seed(0)
        chunks = [r.audio.numpy() for r in pipeline(spec["text"], voice=voice, speed=spec.get("speed", 1.0))
                  if r.audio is not None]
        raw = RAW / f"{cid}.wav"
        sf.write(raw, np.concatenate(chunks), 24000)
        # Mesmo tratamento de uma gravação de verdade.
        subprocess.run([sys.executable.replace(".venv-kokoro", ".venv"), str(ROOT / "scripts" / "prepare_reference.py"),
                        cid, str(raw)], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
