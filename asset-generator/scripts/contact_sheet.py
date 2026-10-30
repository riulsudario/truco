"""Lay out PNGs in a labelled grid over a flat background, for side-by-side review.

  .venv/bin/python scripts/contact_sheet.py OUT.png COLUMNS IMAGE...
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

out, cols, files = Path(sys.argv[1]), int(sys.argv[2]), [Path(f) for f in sys.argv[3:]]
cell, label_h = 256, 14
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), (255, 0, 255))
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    x, y = (i % cols) * cell, (i // cols) * (cell + label_h)
    im = Image.open(f).convert("RGBA")
    im.thumbnail((cell, cell), Image.Resampling.NEAREST if max(im.size) < cell else Image.Resampling.LANCZOS)
    bg = Image.new("RGBA", (cell, cell), (255, 0, 255, 255))
    bg.alpha_composite(im, ((cell - im.width) // 2, (cell - im.height) // 2))
    sheet.paste(bg.convert("RGB"), (x, y + label_h))
    draw.rectangle([x, y, x + cell, y + label_h], fill=(0, 0, 0))
    draw.text((x + 3, y + 2), f.stem[-40:], fill=(255, 255, 255))
sheet.save(out)
