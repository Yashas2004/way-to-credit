"""Generate every logo and favicon asset in apps/web/public/ from the masters in apps/web/brand/.

    python apps/web/scripts/build-logo.py

Masters (an .svg beats a .png of the same name when both exist):
  brand/logo-master.{svg,png}     the full mark, used for logo.png, favicon-48, apple-touch-icon
  brand/favicon-master.{svg,png}  the simplified mark (the W alone), used for the 16/32px frames

When the designer supplies the vector original, drop it in as brand/logo-master.svg and re-run
this script. The app only ever references /logo.png, so nothing else changes. SVG masters need
`pip install cairosvg` (which needs the Cairo library); PNG masters need only Pillow, numpy and
opencv-python.

`--from-jpeg PATH` rebuilds both PNG masters from the original 161x144 JPEG — see brand/README.md.
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

WEB = Path(__file__).resolve().parent.parent
BRAND = WEB / "brand"
PUBLIC = WEB / "public"

BRAND_CYAN = (0x00, 0xA2, 0xD0)  # sampled from the logo; tailwind `brand`
DEEP = (0x11, 0x32, 0x3B)  # tailwind `deep`

# Extra stroke weight, in output pixels per side, for the 16px frame only. At that size the
# favicon is an icon, not a reproduction: the wide W otherwise reads lighter than the round
# favicons beside it in a tab strip. +0.6px starts closing the W's bottom notch.
FAVICON_16_GROW_PX = 0.4


def load_master(stem: str, render_px: int = 1024) -> np.ndarray:
    """The master's alpha channel as float32 0..1, cropped to its content."""
    svg = BRAND / f"{stem}.svg"
    png = BRAND / f"{stem}.png"
    if svg.exists():
        import cairosvg  # only needed once a vector master exists

        data = cairosvg.svg2png(url=str(svg), output_width=render_px)
        img = Image.open(io.BytesIO(data)).convert("RGBA")
    elif png.exists():
        img = Image.open(png).convert("RGBA")
    else:
        raise SystemExit(f"missing master: {svg} or {png}")
    alpha = np.asarray(img)[:, :, 3].astype(np.float32) / 255
    ys, xs = np.nonzero(alpha > 0.02)
    return alpha[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def tint(alpha: np.ndarray, color: tuple[int, int, int]) -> Image.Image:
    out = np.zeros((*alpha.shape, 4), np.uint8)
    out[:, :, :3] = color
    out[:, :, 3] = (np.clip(alpha, 0, 1) * 255).round()
    return Image.fromarray(out, "RGBA")


def fit(alpha: np.ndarray, size: int, content_frac: float = 1.0, grow_px: float = 0.0) -> np.ndarray:
    """Scale alpha into a size x size square, content filling `content_frac` of the longer side."""
    if grow_px > 0:
        scale = content_frac * size / max(alpha.shape)
        r = max(1, round(grow_px / scale))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        alpha = cv2.dilate(np.pad(alpha, r), kernel)
    scale = content_frac * size / max(alpha.shape)
    h, w = max(1, round(alpha.shape[0] * scale)), max(1, round(alpha.shape[1] * scale))
    small = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_AREA)
    out = np.zeros((size, size), np.float32)
    y, x = (size - h) // 2, (size - w) // 2
    out[y : y + h, x : x + w] = small
    return out


def build() -> None:
    mark = load_master("logo-master")
    glyph = load_master("favicon-master")

    tint(fit(mark, 512), BRAND_CYAN).save(PUBLIC / "logo.png", optimize=True)

    icons = {
        16: tint(fit(glyph, 16, 0.96, FAVICON_16_GROW_PX), BRAND_CYAN),
        32: tint(fit(glyph, 32, 0.96), BRAND_CYAN),
        48: tint(fit(mark, 48), BRAND_CYAN),
    }
    for size, icon in icons.items():
        icon.save(PUBLIC / f"favicon-{size}.png", optimize=True)
    # Pillow's ICO writer resizes the first image for every size, so it can't carry the
    # hand-weighted 16px frame; write the container directly with PNG-encoded entries.
    write_ico(PUBLIC / "favicon.ico", [icons[16], icons[32], icons[48]])

    # iOS fills transparency with black, so the touch icon gets an opaque petrol ground.
    touch = Image.new("RGB", (180, 180), DEEP)
    touch_mark = tint(fit(mark, 180, 0.72), BRAND_CYAN)
    touch.paste(touch_mark, (0, 0), touch_mark)
    touch.save(PUBLIC / "apple-touch-icon.png", optimize=True)

    print("wrote", ", ".join(sorted(p.name for p in PUBLIC.iterdir())))


def write_ico(path: Path, images: list[Image.Image]) -> None:
    blobs = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, "PNG")
        blobs.append(buf.getvalue())
    header = (0).to_bytes(2, "little") + (1).to_bytes(2, "little") + len(images).to_bytes(2, "little")
    entries, offset = b"", 6 + 16 * len(images)
    for im, blob in zip(images, blobs):
        w = im.width if im.width < 256 else 0
        h = im.height if im.height < 256 else 0
        entries += bytes([w, h, 0, 0]) + (1).to_bytes(2, "little") + (32).to_bytes(2, "little")
        entries += len(blob).to_bytes(4, "little") + offset.to_bytes(4, "little")
        offset += len(blob)
    path.write_bytes(header + entries + b"".join(blobs))


def masters_from_jpeg(jpeg: Path) -> None:
    """Rebuild both PNG masters from the original one-colour-on-white JPEG. See brand/README.md."""
    rgb = np.asarray(Image.open(jpeg).convert("RGB")).astype(np.float32)
    # One ink on white: each pixel is a*cyan + (1-a)*white, and cyan's red channel is 0,
    # so coverage is recoverable exactly from red.
    alpha = np.clip((255 - rgb[:, :, 0]) / 255, 0, 1)
    alpha[alpha < 0.04] = 0  # JPEG speckle in the white ground
    img = Image.fromarray((alpha * 255).round().astype(np.uint8), "L")
    big = img.resize((img.width * 4, img.height * 4), Image.LANCZOS)
    # Smooth the upscaled JPEG stair-steps, then steepen the edge back to crisp.
    a = cv2.GaussianBlur(np.asarray(big).astype(np.float32) / 255, (0, 0), 1.2)
    t = np.clip((a - 0.5) * 3.0 + 0.5, 0, 1)
    a = t * t * (3 - 2 * t)

    ys, xs = np.nonzero(a > 0.02)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    side = max(ys.max() - ys.min(), xs.max() - xs.min()) + 4
    y0, x0 = round(cy - side / 2), round(cx - side / 2)
    square = np.zeros((side, side), np.float32)
    crop = a[max(0, y0) : y0 + side, max(0, x0) : x0 + side]
    square[: crop.shape[0], : crop.shape[1]] = crop
    tint(square, BRAND_CYAN).save(BRAND / "logo-master.png", optimize=True)

    # The W alone. Its right arm runs on into the 2's top bar (a ligature), so cut at the
    # join and round the cut terminal to match the W's other stroke ends.
    w = (a[230:390, 160:356] > 0.5).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    w[:, 120:] = cv2.morphologyEx(w[:, 120:], cv2.MORPH_OPEN, kernel)
    w_soft = a[230:390, 160:356] * w  # keep the antialiased edge, drop everything cut away
    tint(w_soft, BRAND_CYAN).save(BRAND / "favicon-master.png", optimize=True)
    print("wrote brand/logo-master.png, brand/favicon-master.png")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from-jpeg", type=Path, help="rebuild the PNG masters from the original JPEG first")
    args = parser.parse_args()
    if args.from_jpeg:
        masters_from_jpeg(args.from_jpeg)
    build()
