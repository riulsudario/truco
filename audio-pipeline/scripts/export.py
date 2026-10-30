"""Encodes the processed takes (output/selected/) as OGG/Opus and MP3 for the browser and builds
the manifest manifests/audio_manifest.json.

    python scripts/export.py              # approved and processed
    python scripts/export.py --install    # and install into the game

With --install, replaces the contents of apps/client/public/sfx/voices/ with the approved OGG/MP3
files and writes apps/client/src/lib/voice-manifest.json, the slim manifest the game reads.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    FINAL, MANIFEST_FILE, ROOT, SELECTED, characters, ffprobe, generation, load_lines, load_review, rel,
    require_ffmpeg,
)


CLIENT = ROOT.parent / "apps" / "client"
GAME_AUDIO = CLIENT / "public" / "sfx" / "voices"
GAME_MANIFEST = CLIENT / "src" / "lib" / "voice-manifest.json"


def game_manifest(manifest: dict) -> dict:
    """Only what the game needs to pick and play: the path without extension (it picks OGG or MP3
    depending on the browser) and the variant, which is what everyone in the room must agree on."""
    return {
        "version": manifest["version"],
        "lines": [
            {
                "id": line["id"],
                "event": line["event"],
                "text": line["text"],
                "takes": {
                    char_id: [{"variant": t["variant"], "file": t["ogg"].removesuffix(".ogg")} for t in takes]
                    for char_id, takes in line["voices"].items()
                },
            }
            for line in manifest["lines"]
        ],
    }


def install(manifest: dict) -> None:
    if GAME_AUDIO.exists():
        shutil.rmtree(GAME_AUDIO)
    for line in manifest["lines"]:
        for takes in line["voices"].values():
            for take in takes:
                for fmt in ("ogg", "mp3"):
                    target = GAME_AUDIO / take[fmt]
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(FINAL / take[fmt], target)
    GAME_MANIFEST.write_text(json.dumps(game_manifest(manifest), ensure_ascii=False, indent=2) + "\n")
    print(f"installed into {GAME_AUDIO.relative_to(ROOT.parent)} and {GAME_MANIFEST.relative_to(ROOT.parent)}")


def encode(src: Path, cfg: dict) -> dict[str, Path]:
    ogg = FINAL / src.relative_to(SELECTED).with_suffix(".ogg")
    mp3 = ogg.with_suffix(".mp3")
    ogg.parent.mkdir(parents=True, exist_ok=True)
    fresh = lambda p: p.exists() and p.stat().st_mtime > src.stat().st_mtime  # noqa: E731
    if not fresh(ogg):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                        "-c:a", "libopus", "-b:a", cfg["opus_bitrate"], "-application", "audio",
                        "-ac", "1", "-ar", "48000", str(ogg)], check=True)
    if not fresh(mp3):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                        "-c:a", "libmp3lame", "-q:a", str(cfg["mp3_quality"]), "-ac", "1",
                        "-ar", "44100", str(mp3)], check=True)
    return {"ogg": ogg, "mp3": mp3}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--install", action="store_true", help="copy audio and the slim manifest into the game")
    args = parser.parse_args()
    require_ffmpeg()

    gen = generation()
    lines = load_lines()
    cast = characters()
    review = load_review()["takes"]

    by_line: dict[str, dict[str, list]] = {}
    exported = 0
    for wav in sorted(SELECTED.glob("*/*/*.wav")):
        char_id = wav.relative_to(SELECTED).parts[0]
        if char_id not in cast:
            continue  # tests (smoke, phase_b) stay out of the game
        meta = json.loads(wav.with_suffix(".json").read_text())
        candidate = meta["processing"]["source"]
        status = review.get(candidate, {}).get("status", "pending")
        if status != "approved":
            continue
        files = encode(wav, gen["export"])
        entry = {"variant": meta["variant"], "status": status}
        for fmt, path in files.items():
            probe = ffprobe(path)
            entry[fmt] = path.relative_to(FINAL).as_posix()
            entry[f"{fmt}_bytes"] = path.stat().st_size
            entry["duration_s"] = round(float(probe["format"]["duration"]), 3)
        entry.update({
            "spoken_text": meta["spoken_text"],
            "model": meta["model"],
            "params": meta["params"],
            "seed": meta["seed"],
            "candidate": candidate,
        })
        by_line.setdefault(meta["line_id"], {}).setdefault(char_id, []).append(entry)
        exported += 1

    manifest = {
        "version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "formats": {"ogg": "audio/ogg; codecs=opus", "mp3": "audio/mpeg"},
        "characters": [
            {"id": cid, "name": c["name"], "gender": c["gender"]} for cid, c in cast.items()
        ],
        "categories": lines["categories"],
        "lines": [],
    }
    for line in lines["lines"]:
        voices = by_line.get(line["id"], {})
        for takes in voices.values():
            takes.sort(key=lambda t: t["variant"])
        manifest["lines"].append({
            "id": line["id"],
            "event": line["category"],
            "group": lines["categories"][line["category"]]["group"],
            "number": line["number"],
            "text": line["text"],
            "voices": voices,
        })
    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"{exported} takes exported; manifest at {rel(MANIFEST_FILE)}")

    if args.install:
        install(manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
