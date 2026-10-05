"""Rasterize logo direction A into the favicons Next serves from frontend/src/app/.

favicon.ico uses the 16-unit drawing, apple-icon.png the 24-unit one, inverse on a
--primary tile (as in the spec board). Paths come from
docs/ui-concept/screens/Logo-Mark.html; icon.svg is written by hand.

Run from backend/ (needs Pillow): uv run python ../scripts/logo-icons.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "frontend/src/app"
# --primary (light) in globals.css and --primary-foreground, oklch(0.985 0 0).
PRIMARY = (0x4F, 0x2B, 0x69, 255)
PRIMARY_FOREGROUND = (0xFA, 0xFA, 0xFA, 255)
SUPERSAMPLE = 16


def arc(cx, cy, r, a0, a1, n=24):
    return [
        (
            cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
            cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)),
        )
        for i in range(n + 1)
    ]


def slip(x0, x1, top, r, teeth):
    """Receipt outline: rounded top corners, then the zigzag from right to left."""
    return arc(x0 + r, top + r, r, 180, 270) + arc(x1 - r, top + r, r, 270, 360) + teeth


def render(units, shape, holes, scale, fg, bg=(0, 0, 0, 0), pad=0):
    size = round((units + 2 * pad) * scale)
    img = Image.new("RGBA", (size * SUPERSAMPLE,) * 2, bg)
    draw = ImageDraw.Draw(img)

    def px(x, y):
        return ((x + pad) * scale * SUPERSAMPLE, (y + pad) * scale * SUPERSAMPLE)

    draw.polygon([px(*p) for p in shape], fill=fg)
    for x0, y0, x1, y1 in holes:
        (ax, ay), (bx, by) = px(x0, y0), px(x1, y1)
        draw.rectangle([ax, ay, bx - 1, by - 1], fill=bg)
    return img.resize((size, size), Image.LANCZOS)


S16 = slip(
    2, 14, 1, 2, [(14, 12), (12, 14), (10, 12), (8, 14), (6, 12), (4, 14), (2, 12)]
)
S16_HOLES = [(5, 4, 11, 6), (5, 8, 9, 10)]
M24 = slip(
    5,
    19,
    2,
    2,
    [
        (19, 19),
        (17.25, 22),
        (15.5, 19),
        (13.75, 22),
        (12, 19),
        (10.25, 22),
        (8.5, 19),
        (6.75, 22),
        (5, 19),
    ],
)
M24_HOLES = [(8, 6, 16, 8), (8, 10, 13, 12), (8, 14, 16, 16)]

icons = [render(16, S16, S16_HOLES, size / 16, PRIMARY) for size in (16, 32, 48)]
# Largest first: Pillow only writes sizes up to the base image's; the smaller ones
# come from append_images instead of being downscaled from 48.
icons[2].save(
    OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=icons[:2]
)

# Inverse tile: 24 units plus 4 units padding per side, as in Logo-Mark.html.
render(24, M24, M24_HOLES, 180 / 32, PRIMARY_FOREGROUND, bg=PRIMARY, pad=4).convert(
    "RGB"
).save(OUT / "apple-icon.png")
