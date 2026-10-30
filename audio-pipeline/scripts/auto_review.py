"""Pré-aprovação automática, para ter uma biblioteca jogável antes da revisão de ouvido: aprova a
tomada que o Whisper entendeu (CER até --max-cer) e que passa nas checagens de arquivo do
validate.py. Não toca em decisão feita na revisão (review.py); as automáticas ficam marcadas com
"by": "auto" e a revisão pode trocar qualquer uma.

Precisa da transcrição gravada nos JSON das tomadas:

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
    parser.add_argument("--max-cer", type=float, default=0.15, help="distância máxima para o texto (0 a 1)")
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
            "note": f"auto: Whisper ouviu \"{asr['text'].strip()}\" (CER {asr['cer']:.0%})"
                    + (f"; {'; '.join(errors)}" if errors else ""),
            "by": "auto",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }

    if not args.dry_run:
        save_review(review)
    print(f"{counts['approved']} aprovadas, {counts['pending']} para ouvir, "
          f"{counts['manual']} já revisadas à mão, {counts['no_asr']} sem transcrição")
    for char_id, line_ids in sorted(uncovered.items()):
        missing = sorted(lid for lid in line_ids if (char_id, lid) not in covered)
        if missing:
            print(f"  {char_id}: sem nenhuma tomada aprovada em {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
