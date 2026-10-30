"""Processes the takes with FFmpeg: trims edge silence, light compression, normalizes loudness
(two-pass loudnorm) and limits the peak. The original WAV is never changed; the processed one goes
to output/selected/ under the same relative path.

    python scripts/process_audio.py                    # takes approved in the review
    python scripts/process_audio.py --all              # every candidate (to hear them processed)
    python scripts/process_audio.py --source output/smoke --all
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CANDIDATES, ROOT, SELECTED, generation, load_review, rel, require_ffmpeg  # noqa: E402


def trim_filter(threshold_db: float, keep_ms: int) -> str:
    # silenceremove only trims the start; the double areverse reuses the same filter for the end.
    trim = (f"silenceremove=start_periods=1:start_threshold={threshold_db}dB:"
            f"start_silence={keep_ms / 1000}:detection=peak")
    return f"{trim},areverse,{trim},areverse"


def measure(path: Path, pre: str, cfg: dict) -> dict:
    """First loudnorm pass: measures the already trimmed and compressed audio."""
    target = f"loudnorm=I={cfg['loudness_lufs']}:TP={cfg['true_peak_db']}:LRA=11:print_format=json"
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"{pre},{target}", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    )
    return json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out.stderr, re.S).group(0))


def process(src: Path, dst: Path, cfg: dict, sample_rate: int) -> dict:
    pre = trim_filter(cfg["trim_threshold_db"], cfg["keep_silence_ms"])
    if cfg.get("compress"):
        pre += ",acompressor=threshold=-20dB:ratio=2.5:attack=5:release=90:makeup=1"
    m = measure(src, pre, cfg)
    loudnorm = (
        f"loudnorm=I={cfg['loudness_lufs']}:TP={cfg['true_peak_db']}:LRA=11:"
        f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
        f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    # A short fade at the edges avoids a click where the cut landed mid-wave.
    chain = f"{pre},{loudnorm},alimiter=limit={10 ** (cfg['true_peak_db'] / 20):.3f}:level=false," \
            f"afade=t=in:d=0.005,areverse,afade=t=in:d=0.02,areverse"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.wav")
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-af", chain,
         "-ar", str(sample_rate), "-ac", "1", "-c:a", "pcm_s16le", str(tmp)],
        check=True,
    )
    tmp.replace(dst)
    return {"input_lufs": float(m["input_i"]), "input_true_peak": float(m["input_tp"])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="process every take in the source, not only approved ones")
    parser.add_argument("--source", type=Path, default=CANDIDATES, help="source folder (default: output/candidates)")
    parser.add_argument("--character", action="append")
    parser.add_argument("--force", action="store_true", help="reprocess even if the target is newer")
    args = parser.parse_args()
    require_ffmpeg()

    gen = generation()
    source = (ROOT / args.source).resolve() if not args.source.is_absolute() else args.source
    review = load_review()["takes"]
    takes = sorted(source.rglob("*.wav"))
    takes = [t for t in takes if not t.name.endswith(".tmp.wav")]
    if not args.all:
        takes = [t for t in takes if review.get(rel(t), {}).get("status") == "approved"]
    if args.character:
        takes = [t for t in takes if t.relative_to(source).parts[0] in args.character]
    if not takes:
        print("Nothing to process. Approve takes in the review (scripts/review.py) or use --all.")
        return 0

    target_root = SELECTED if source == CANDIDATES.resolve() else SELECTED / source.name
    done = 0
    for src in takes:
        dst = target_root / src.relative_to(source)
        if not args.force and dst.exists() and dst.stat().st_mtime > src.stat().st_mtime:
            continue
        stats = process(src, dst, gen["processing"], gen["export"]["sample_rate"])
        meta = src.with_suffix(".json")
        info = json.loads(meta.read_text()) if meta.exists() else {}
        info["processing"] = {**gen["processing"], **stats, "source": rel(src)}
        dst.with_suffix(".json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n")
        done += 1
        print(f"{rel(dst)}  (input {stats['input_lufs']:.1f} LUFS)")
    print(f"{done} processed, {len(takes) - done} already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
