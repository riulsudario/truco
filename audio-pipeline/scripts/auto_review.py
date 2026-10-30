"""Automatic pre-approval, to have a playable library before listening: approves the take that
Whisper understood (CER up to --max-cer) and that passes validate.py's file checks. It never
touches a decision made in the review (review.py); automatic ones are marked "by": "auto" and the
review can change any of them.

Needs the transcription stored in the takes' JSON:

    python scripts/validate.py --asr --stage candidates
    python scripts/auto_review.py
    python scripts/auto_review.py --max-cer 0.1 --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CANDIDATES, characters, generation, load_review, rel, save_review  # noqa: E402
from validate import check_file  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-cer", type=float, default=0.15, help="maximum distance to the text (0 to 1)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cast = characters()
    cfg = generation()["validation"]
    review = load_review()
    counts = {"approved": 0, "pending": 0, "manual": 0, "no_asr": 0}
    uncovered: dict[str, set[str]] = {}
    covered: set[tuple[str, str]] = set()
    for wav in sorted(CANDIDATES.glob("*/*/*.wav")):
        meta = json.loads(wav.with_suffix(".json").read_text())
        if meta["character"] not in cast:
            continue
        key = rel(wav)
        entry = review["takes"].get(key, {})
        if entry and entry.get("by") != "auto":
            counts["manual"] += 1
            if entry.get("status") == "approved":
                covered.add((meta["character"], meta["line_id"]))
            continue
        asr = meta.get("asr")
        if not asr:
            counts["no_asr"] += 1
            continue
        _, errors, _ = check_file(wav, cfg, processed=False)
        ok = not errors and asr["cer"] <= args.max_cer
        status = "approved" if ok else "pending"
        counts[status] += 1
        if ok:
            covered.add((meta["character"], meta["line_id"]))
        else:
            uncovered.setdefault(meta["character"], set()).add(meta["line_id"])
        review["takes"][key] = {
            "status": status,
            "best": False,
            "note": f"auto: Whisper heard \"{asr['text'].strip()}\" (CER {asr['cer']:.0%})"
                    + (f"; {'; '.join(errors)}" if errors else ""),
            "by": "auto",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }

    if not args.dry_run:
        save_review(review)
    print(f"{counts['approved']} approved, {counts['pending']} to listen to, "
          f"{counts['manual']} already reviewed by hand, {counts['no_asr']} without transcription")
    for char_id, line_ids in sorted(uncovered.items()):
        missing = sorted(lid for lid in line_ids if (char_id, lid) not in covered)
        if missing:
            print(f"  {char_id}: no approved take for {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
