"""Build web-ready art from the original PNGs.

Reads   assets-src/art/<category>/*.png   (originals, never modified)
Writes  public/assets/<category>/*.webp   (trimmed, resized, compressed)
        public/assets/art-manifest.json   (sizes + anchors the game code reads)

Run:  python tools/build_art.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets-src" / "art"
OUT = ROOT / "public" / "assets"

# max_side: longest side of the output in px. trim: crop to visible pixels.
# anchor: point of the sprite that sits on the tile, as [x, y] fractions (0,0 = top-left).
RULES = {
    "backgrounds": {"max_side": 2048, "trim": False, "anchor": [0.5, 0.5], "quality": 88},
    "textures": {"max_side": 1024, "trim": False, "anchor": [0.5, 0.5], "quality": 88, "square_pow2": True},
    "defenders": {"max_side": 512, "trim": True, "anchor": [0.5, 1.0], "quality": 90},
    "enemies": {"max_side": 512, "trim": True, "anchor": [0.5, 1.0], "quality": 90},
    "vfx": {"max_side": 256, "trim": True, "anchor": [0.5, 0.5], "quality": 90},
    "props": {"max_side": 512, "trim": True, "anchor": [0.5, 1.0], "quality": 90},
    "ui": {"max_side": 1024, "trim": True, "anchor": [0.5, 0.5], "quality": 92},
}
# Per-file overrides.
OVERRIDES = {
    "enemies/enemy_lich": {"max_side": 768},          # boss is drawn bigger
    "enemies/enemy_wisp": {"anchor": [0.5, 0.5]},     # floating enemies anchor at their middle
    "enemies/enemy_shade": {"anchor": [0.5, 0.5]},
    "enemies/enemy_wraith": {"anchor": [0.5, 0.5]},
    "defenders/def_salt_rune": {"anchor": [0.5, 0.5]},  # flat decal on the tile
    "backgrounds/fg_gate_left": {"trim": True, "anchor": [0.5, 1.0]},
    "ui/ui_spellbook": {"max_side": 1536},
    "ui/ui_logo": {"max_side": 1280},
    "ui/icon_soul_gem": {"max_side": 256},
    "ui/icon_heart_full": {"max_side": 256},
    "ui/icon_heart_empty": {"max_side": 256},
    "ui/icon_star_full": {"max_side": 256},
    "ui/icon_star_empty": {"max_side": 256},
    "ui/icon_lock": {"max_side": 256},
}
ALPHA_VISIBLE = 8   # alpha above this counts as visible when trimming
PAD = 0.02          # keep 2% empty margin after trimming, so glows aren't clipped


def _box_blur(arr: np.ndarray, r: int) -> np.ndarray:
    """Box blur over the first two axes, edges clamped."""
    for axis in (0, 1):
        pad = [(0, 0)] * arr.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(arr, pad, mode="edge"), axis=axis)
        n = arr.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        arr = (hi - lo) / (2 * r + 1)
    return arr


def _blur(arr: np.ndarray, r: int) -> np.ndarray:
    return _box_blur(_box_blur(arr, max(1, r // 2)), max(1, r // 2))  # two passes ~ gaussian


def bleed_edges(im: Image.Image) -> Image.Image:
    """Fill fully transparent pixels with nearby colours.

    GPUs blend neighbouring pixels when scaling. If transparent pixels hold random colours
    (often white or black), sprites get a thin halo. Spreading edge colours outward fixes that.
    """
    a = np.asarray(im.getchannel("A"), dtype=np.float32) / 255.0
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    filled = rgb.copy()
    known = a > 0
    premult = rgb * a[..., None]
    for radius in (2, 6, 16, 48):
        blur_rgb = _blur(premult, radius)
        blur_a = _blur(a, radius)
        ok = (~known) & (blur_a > 1e-4)
        filled[ok] = blur_rgb[ok] / blur_a[ok][:, None]
        known = known | ok
    out = np.dstack([np.clip(filled, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def build_one(path: Path, category: str) -> dict:
    key = f"{category}/{path.stem}"
    rule = {**RULES[category], **OVERRIDES.get(key, {})}
    im = Image.open(path)
    im.load()
    src_size = im.size
    has_alpha = "A" in im.getbands()
    im = im.convert("RGBA") if has_alpha else im.convert("RGB")

    if rule["trim"] and has_alpha:
        bbox = im.getchannel("A").point(lambda v: 255 if v > ALPHA_VISIBLE else 0).getbbox()
        if bbox:
            pad = int(max(im.size) * PAD)
            bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                    min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad))
            im = im.crop(bbox)

    if rule.get("square_pow2"):
        im = im.resize((rule["max_side"], rule["max_side"]), Image.LANCZOS)
    else:
        scale = min(1.0, rule["max_side"] / max(im.size))
        if scale < 1.0:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)

    if has_alpha:
        im = bleed_edges(im)

    dst = OUT / category / f"{path.stem}.webp"
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=rule["quality"], alpha_quality=100, method=6)
    return {
        "url": f"/assets/{category}/{path.stem}.webp",
        "width": im.width,
        "height": im.height,
        "aspect": round(im.width / im.height, 4),
        "anchor": rule["anchor"],
        "transparent": has_alpha,
        "sourceSize": list(src_size),
        "bytes": dst.stat().st_size,
    }


def main() -> None:
    manifest = {}
    for category in RULES:
        folder = SRC / category
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.png")):
            manifest[f"{category}/{path.stem}"] = build_one(path, category)
    (OUT / "art-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    src_total = sum(p.stat().st_size for p in SRC.rglob("*.png"))
    out_total = sum(v["bytes"] for v in manifest.values())
    for k, v in manifest.items():
        print(f"{k:32} {v['width']:5}x{v['height']:<5} {v['bytes'] / 1024:7.0f} KB")
    print(f"\n{len(manifest)} images: {src_total / 1e6:.1f} MB -> {out_total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
