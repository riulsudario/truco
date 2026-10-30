"""Turn a raw 1024 px generation into a game-ready pixel art sprite or tile.

Shrinking alone does not make pixel art, so the reduction works on palette
indices: the raw image is first snapped to the profile palette (shared by every
asset, which keeps colours harmonised), then each output pixel takes the most
common palette colour of its source block. Nothing is interpolated, so there
are no blended in-between colours, halos or soft edges.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

TRANSPARENT, SHADOW = -1, -2


# -- palette --------------------------------------------------------------
def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb) -> str:
    return "#" + "".join(f"{int(c):02x}" for c in rgb[:3])


def extract_palette(reference: Path, size: int, extra: list[str]) -> list[str]:
    """Most representative colours of the reference, plus the profile's extra colours."""
    img = Image.open(reference).convert("RGB")
    img.thumbnail((384, 384), Image.Resampling.NEAREST)
    # Over-quantise first, then keep the colours that are far apart: area-weighted
    # quantisation alone spends the palette on near-identical floor browns.
    over = min(256, size * 4)
    quant = img.quantize(colors=over, method=Image.Quantize.MEDIANCUT, kmeans=2)
    raw = np.array(quant.getpalette()[: over * 3], dtype=np.uint8).reshape(-1, 3)
    counts = np.zeros(len(raw))
    for count, i in quant.getcolors(over):
        counts[i] = count
    present = counts > 0
    cand, weight = raw[present], counts[present] ** 0.25
    lab = _to_lab(cand)
    picked = [int(np.argmax(counts[present]))]
    dist = np.sqrt(((lab - lab[picked[0]]) ** 2).sum(-1))
    while len(picked) < min(size, len(cand)):
        nxt = int(np.argmax(dist * weight))
        picked.append(nxt)
        dist = np.minimum(dist, np.sqrt(((lab - lab[nxt]) ** 2).sum(-1)))
    colours = [rgb_to_hex(cand[i]) for i in picked]
    for colour in extra:
        if colour.lower() not in colours:
            colours.append(colour.lower())
    return colours


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def _to_lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


@dataclass
class Palette:
    colours: np.ndarray  # (N, 3) uint8
    outline: np.ndarray  # (3,) uint8
    shadow: np.ndarray  # (4,) uint8 RGBA

    @classmethod
    def from_style(cls, style: dict, root: Path) -> "Palette":
        path = root / style["palette"]["file"]
        if not path.exists():
            raise FileNotFoundError(f"{path} missing; run `python generate.py palette`")
        data = json.loads(path.read_text())
        colours = np.array([hex_to_rgb(c) for c in data["colours"]], dtype=np.uint8)
        darkest = colours[int(np.argmin(luma(colours.astype(float))))]
        outline_cfg = style.get("outline", {}).get("color", "auto")
        outline = darkest if outline_cfg == "auto" else np.array(hex_to_rgb(outline_cfg), np.uint8)
        shadow = np.array([*darkest, style.get("shadow", {}).get("alpha", 110)], dtype=np.uint8)
        return cls(colours, outline, shadow)

    def quantize(self, rgb: np.ndarray) -> np.ndarray:
        """Nearest palette index (CIELAB distance) for each pixel of an (..., 3) array."""
        flat = rgb.reshape(-1, 3)
        packed = (flat[:, 0].astype(np.int32) << 16) | (flat[:, 1].astype(np.int32) << 8) | flat[:, 2]
        uniq, inverse = np.unique(packed, return_inverse=True)
        uniq_rgb = np.stack([(uniq >> 16) & 255, (uniq >> 8) & 255, uniq & 255], -1)
        pal_lab = _to_lab(self.colours)
        best = np.empty(len(uniq), dtype=np.int32)
        for start in range(0, len(uniq), 8192):
            lab = _to_lab(uniq_rgb[start:start + 8192])
            dist = ((lab[:, None, :] - pal_lab[None, :, :]) ** 2).sum(-1)
            best[start:start + 8192] = dist.argmin(1)
        return best[inverse].reshape(rgb.shape[:-1])


# -- shared helpers -------------------------------------------------------
def block_mode(index: np.ndarray, out_w: int, out_h: int, shadow_wins: bool = True) -> np.ndarray:
    """Downsample an index map (palette ids, TRANSPARENT, SHADOW) by majority per block."""
    h, w = index.shape
    ys = np.linspace(0, h, out_h + 1).round().astype(int)
    xs = np.linspace(0, w, out_w + 1).round().astype(int)
    out = np.full((out_h, out_w), TRANSPARENT, dtype=np.int32)
    for i in range(out_h):
        for j in range(out_w):
            block = index[ys[i]:ys[i + 1], xs[j]:xs[j + 1]].ravel()
            if block.size == 0:
                continue
            solid = block[block >= 0]
            shadow = np.count_nonzero(block == SHADOW)
            if solid.size * 2 >= block.size:
                out[i, j] = np.bincount(solid).argmax()
            elif shadow_wins and (solid.size + shadow) * 2 >= block.size:
                out[i, j] = SHADOW
    return out


def despeckle(index: np.ndarray) -> np.ndarray:
    """Replace solid pixels whose four solid neighbours all share one other colour."""
    out = index.copy()
    h, w = index.shape
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            c = index[y, x]
            if c < 0:
                continue
            n = {index[y - 1, x], index[y + 1, x], index[y, x - 1], index[y, x + 1]}
            if len(n) == 1:
                (other,) = n
                if other >= 0 and other != c:
                    out[y, x] = other
    return out


def orphan_ratio(index: np.ndarray) -> float:
    """Share of solid pixels that match none of their four neighbours (noise metric)."""
    solid = index >= 0
    if not solid.any():
        return 0.0
    padded = np.pad(index, 1, constant_values=TRANSPARENT)
    c = padded[1:-1, 1:-1]
    same = ((padded[:-2, 1:-1] == c) | (padded[2:, 1:-1] == c) | (padded[1:-1, :-2] == c) | (padded[1:-1, 2:] == c))
    return float(np.count_nonzero(solid & ~same) / np.count_nonzero(solid))


def render(index: np.ndarray, palette: Palette, outline: bool) -> np.ndarray:
    h, w = index.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    solid = index >= 0
    rgba[solid, :3] = palette.colours[index[solid]]
    rgba[solid, 3] = 255
    rgba[index == SHADOW] = palette.shadow
    if outline:
        grown = ndimage.binary_dilation(solid, structure=ndimage.generate_binary_structure(2, 1))
        edge = grown & ~solid
        rgba[edge, :3] = palette.outline
        rgba[edge, 3] = 255
    return rgba


# -- sprites --------------------------------------------------------------
def process_sprite(raw: Image.Image, asset: dict, style: dict, palette: Palette) -> tuple[Image.Image, dict]:
    cfg = style["processing"]
    keep_shadow = style.get("shadow", {}).get("keep", True)
    outline = style.get("outline", {}).get("enabled", False)
    pad = max(cfg["padding"], 1 if outline else 0)
    tw, th = asset["target_size"]["width"], asset["target_size"]["height"]
    errors, warnings = [], []

    arr = np.array(raw.convert("RGBA"))
    alpha = arr[..., 3]
    solid = alpha >= cfg["alpha_threshold"]
    shadow = (alpha >= cfg["shadow_min_alpha"]) & ~solid & keep_shadow
    coverage = float(solid.mean())
    if coverage < 0.005:
        errors.append("empty: almost no opaque pixels")
    if coverage > 0.92:
        errors.append("no background separation: image is almost fully opaque")
    if errors:
        return None, {"errors": errors, "warnings": warnings, "coverage": round(coverage, 4)}

    border = np.concatenate([solid[0], solid[-1], solid[:, 0], solid[:, -1]])
    if border.mean() > 0.01:
        errors.append(f"object touches the frame edge ({border.mean():.0%} of border), likely cropped")

    labels, count = ndimage.label(solid)
    sizes = np.bincount(labels.ravel())[1:]
    order = np.argsort(sizes)[::-1]
    keep = sizes >= sizes[order[0]] * cfg["min_island_ratio"]
    if count > 1 and sizes[order[1]] >= sizes[order[0]] * 0.25:
        errors.append(f"multiple separate objects ({int((sizes >= sizes[order[0]] * 0.25).sum())} large parts)")
    dropped = int(count - keep.sum())
    solid = keep[labels - 1] & (labels > 0)
    if dropped:
        warnings.append(f"removed {dropped} stray fragments")

    ys, xs = np.nonzero(solid | shadow)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    index = np.full(solid.shape, TRANSPARENT, dtype=np.int32)
    index[shadow] = SHADOW
    index[solid] = palette.quantize(arr[..., :3][solid])
    index = index[y0:y1, x0:x1]

    src_h, src_w = index.shape
    inner_w, inner_h = tw - 2 * pad, th - 2 * pad
    scale = min(inner_w / src_w, inner_h / src_h)
    out_w, out_h = max(1, round(src_w * scale)), max(1, round(src_h * scale))
    small = despeckle(block_mode(index, out_w, out_h, keep_shadow))

    canvas = np.zeros((th, tw, 4), dtype=np.uint8)
    ox = (tw - out_w) // 2
    oy = th - pad - out_h if asset["anchor"] == "bottom_center" else (th - out_h) // 2
    if asset["anchor"] == "top_left":
        ox, oy = pad, pad
    # With an outline the sprite grows one pixel on each side, into the padding.
    grow = 1 if outline else 0
    sprite = render(np.pad(small, grow, constant_values=TRANSPARENT), palette, outline)
    canvas[oy - grow:oy + out_h + grow, ox - grow:ox + out_w + grow] = sprite

    alpha_values = sorted(int(v) for v in np.unique(canvas[..., 3]))
    allowed = {0, 255, int(palette.shadow[3])}
    if not set(alpha_values) <= allowed:
        errors.append(f"unexpected alpha values {alpha_values}")
    noise = orphan_ratio(small)
    if noise > 0.12:
        warnings.append(f"noisy pixels: {noise:.0%} of pixels match no neighbour")
    aspect_src, aspect_out = src_w / src_h, out_w / out_h
    qc = {
        "errors": errors, "warnings": warnings,
        "coverage": round(coverage, 4),
        "source_bbox": [int(x0), int(y0), int(x1), int(y1)],
        "object_size": [out_w, out_h],
        "canvas_size": [tw, th],
        "fill": [round(out_w / inner_w, 3), round(out_h / inner_h, 3)],
        "aspect_error": round(abs(aspect_out - aspect_src) / aspect_src, 4),
        "alpha_values": alpha_values,
        "colours_used": int(len(np.unique(small[small >= 0]))),
        "orphan_ratio": round(noise, 4),
        "anchor": anchor_point(asset["anchor"], tw, th, pad),
    }
    return Image.fromarray(canvas, "RGBA"), qc


def anchor_point(anchor: str, w: int, h: int, pad: int) -> list[float]:
    """Normalised anchor (Phaser origin) for the canvas."""
    if anchor == "bottom_center":
        return [0.5, round((h - pad) / h, 4)]
    if anchor == "center":
        return [0.5, 0.5]
    return [0.0, 0.0]


# -- tiles ----------------------------------------------------------------
def seam_ratios(rgb: np.ndarray) -> tuple[float, float]:
    """Colour jump across the wrap edge divided by the average jump between interior neighbours."""
    a = rgb.astype(np.float64)
    inner_x = np.abs(a[:, 1:] - a[:, :-1]).mean()
    inner_y = np.abs(a[1:] - a[:-1]).mean()
    wrap_x = np.abs(a[:, 0] - a[:, -1]).mean()
    wrap_y = np.abs(a[0] - a[-1]).mean()
    return float(wrap_x / (inner_x + 1e-6)), float(wrap_y / (inner_y + 1e-6))


def process_tile(raw: Image.Image, asset: dict, style: dict, palette: Palette,
                 seam_limit: float = 1.6) -> tuple[Image.Image, dict]:
    tw, th = asset["target_size"]["width"], asset["target_size"]["height"]
    arr = np.array(raw.convert("RGB"))
    errors, warnings = [], []
    index = palette.quantize(arr)
    small = despeckle_wrap(block_mode(index, tw, th, shadow_wins=False))
    max_colours = style["processing"].get("tile_max_colours")
    if max_colours:
        small = despeckle_wrap(limit_colours(small, palette, max_colours))
    if (small < 0).any():
        errors.append("tile has empty cells")
        small[small < 0] = 0
    rgb = palette.colours[small]
    raw_ratio = seam_ratios(arr)
    ratio = seam_ratios(rgb)
    if max(ratio) > seam_limit:
        errors.append(f"visible seam: wrap edge jump is {max(ratio):.2f}x the interior average")
    noise = orphan_ratio(small)
    if noise > 0.2:
        warnings.append(f"noisy pixels: {noise:.0%} of pixels match no neighbour")
    qc = {
        "errors": errors, "warnings": warnings,
        "canvas_size": [tw, th],
        "seam_ratio": [round(r, 3) for r in ratio],
        "raw_seam_ratio": [round(r, 3) for r in raw_ratio],
        "colours_used": int(len(np.unique(small))),
        "orphan_ratio": round(noise, 4),
        "alpha_values": [255],
        "anchor": [0.0, 0.0],
    }
    return Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA"), qc


def limit_colours(index: np.ndarray, palette: Palette, count: int) -> np.ndarray:
    """Keep the `count` most used palette colours and map the rest to the nearest kept one."""
    used = np.bincount(index[index >= 0].ravel(), minlength=len(palette.colours))
    keep = np.argsort(used)[::-1][:count]
    keep = keep[used[keep] > 0]
    lab = _to_lab(palette.colours)
    nearest = keep[((lab[:, None, :] - lab[None, keep, :]) ** 2).sum(-1).argmin(1)]
    out = index.copy()
    out[index >= 0] = nearest[index[index >= 0]]
    return out


def despeckle_wrap(index: np.ndarray) -> np.ndarray:
    """despeckle() for tiles: neighbours wrap around so the edges are treated like the interior."""
    padded = np.pad(index, 1, mode="wrap")
    return despeckle(padded)[1:-1, 1:-1]


def tile_preview(tile: Image.Image, repeat: int = 5, zoom: int = 4) -> Image.Image:
    w, h = tile.size
    grid = Image.new("RGBA", (w * repeat, h * repeat))
    for y in range(repeat):
        for x in range(repeat):
            grid.paste(tile, (x * w, y * h))
    return grid.resize((w * repeat * zoom, h * repeat * zoom), Image.Resampling.NEAREST)


def upscale(img: Image.Image, zoom: int) -> Image.Image:
    return img.resize((img.width * zoom, img.height * zoom), Image.Resampling.NEAREST)
