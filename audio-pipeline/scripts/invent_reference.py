"""Creates a synthetic reference for the character, with no real person: speaks a pt-BR text with
Kokoro-82M (Apache-2.0, local) in a voice that blends its voicepacks (`synthetic` block in
characters.yaml). It lets the cast be shown while there are no authorized recordings; a real
recording replaces the file through prepare_reference.py.

Runs in its own venv (.venv-kokoro, CPU torch) to keep its dependencies apart from Chatterbox:

    .venv-kokoro/bin/python scripts/invent_reference.py            # everyone with a synthetic block
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
            raise SystemExit(f"{cid} has no synthetic block in characters.yaml")
        total = sum(spec["blend"].values())
        voice = sum(w / total * pipeline.load_voice(name) for name, w in spec["blend"].items())
        torch.manual_seed(0)
        chunks = [r.audio.numpy() for r in pipeline(spec["text"], voice=voice, speed=spec.get("speed", 1.0))
                  if r.audio is not None]
        raw = RAW / f"{cid}.wav"
        sf.write(raw, np.concatenate(chunks), 24000)
        # Same processing as a real recording.
        subprocess.run([sys.executable.replace(".venv-kokoro", ".venv"), str(ROOT / "scripts" / "prepare_reference.py"),
                        cid, str(raw)], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
