"""Converts any recording (WhatsApp .opus/.ogg, phone .m4a, .mp3, .wav) into the character's
reference: mono, 24 kHz, no edge silence or long pauses, normalized loudness and up to 12 s. The
model only reads the first 10 s, and the first 6 weigh the most.

    python scripts/prepare_reference.py dona_cida ~/Downloads/cida.opus
    python scripts/prepare_reference.py tonhao recording.m4a --start 3.5
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
    parser.add_argument("--start", type=float, default=0.0, help="skip the first N seconds")
    parser.add_argument("--max", type=float, default=12.0, help="maximum duration in seconds")
    args = parser.parse_args()
    require_ffmpeg()

    cast = characters()
    if args.character not in cast:
        raise SystemExit(f"unknown character: {args.character} (options: {', '.join(cast)})")
    target = ROOT / cast[args.character]["reference"]
    target.parent.mkdir(parents=True, exist_ok=True)
    # Inner pauses longer than 0.4 s become 0.4 s, so the 10 s the model reads are almost all voice.
    chain = ("silenceremove=start_periods=1:start_threshold=-45dB:"
             "stop_periods=-1:stop_threshold=-45dB:stop_duration=0.4:stop_silence=0.4:detection=peak,"
             "highpass=f=70,loudnorm=I=-18:TP=-2:LRA=11")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(args.start),
                    "-i", str(args.recording), "-af", chain, "-t", str(args.max),
                    "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(target)], check=True)
    duration = float(ffprobe(target)["format"]["duration"])
    print(f"{rel(target)}: {duration:.1f}s")
    if duration < 6:
        print("! less than 6 s of voice: the identity tends to come out unstable; record a bit more.")
    if not str(cast[args.character].get("consent") or "").strip():
        print(f"! fill in `consent` for {args.character} in config/characters.yaml before generating.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
