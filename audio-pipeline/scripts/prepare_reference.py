"""Converte uma gravação qualquer (WhatsApp .opus/.ogg, .m4a do celular, .mp3, .wav) na
referência do personagem: mono, 24 kHz, sem silêncio nas pontas nem pausas longas, volume
normalizado e até 12 s. O modelo só lê os primeiros 10 s, e os 6 primeiros pesam mais.

    python scripts/prepare_reference.py dona_cida ~/Downloads/cida.opus
    python scripts/prepare_reference.py tonhao gravacao.m4a --start 3.5
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, characters, ffprobe, rel, require_ffmpeg  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("character")
    parser.add_argument("recording", type=Path)
    parser.add_argument("--start", type=float, default=0.0, help="pula os primeiros N segundos")
    parser.add_argument("--max", type=float, default=12.0, help="duração máxima em segundos")
    args = parser.parse_args()
    require_ffmpeg()

    cast = characters()
    if args.character not in cast:
        raise SystemExit(f"personagem desconhecido: {args.character} (opções: {', '.join(cast)})")
    target = ROOT / cast[args.character]["reference"]
    target.parent.mkdir(parents=True, exist_ok=True)
    # Pausas internas acima de 0,4 s viram 0,4 s: assim os 10 s lidos pelo modelo são quase só voz.
    chain = ("silenceremove=start_periods=1:start_threshold=-45dB:"
             "stop_periods=-1:stop_threshold=-45dB:stop_duration=0.4:stop_silence=0.4:detection=peak,"
             "highpass=f=70,loudnorm=I=-18:TP=-2:LRA=11")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(args.start),
                    "-i", str(args.recording), "-af", chain, "-t", str(args.max),
                    "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(target)], check=True)
    duration = float(ffprobe(target)["format"]["duration"])
    print(f"{rel(target)}: {duration:.1f}s")
    if duration < 6:
        print("! menos de 6 s de voz: a identidade tende a sair instável; grave um pouco mais.")
    if not str(cast[args.character].get("consent") or "").strip():
        print(f"! preencha `consent` de {args.character} em config/characters.yaml antes de gerar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
