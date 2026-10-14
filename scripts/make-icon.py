#!/usr/bin/env python3
"""Regenerate app icons from a single master tile."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def rounded_tile(size, radius_ratio=0.24, pad_ratio=0.075):
    """Master icon: calm green pond, a swimming koi, and the product name."""
    pad = int(size * pad_ratio)
    tile = size - pad * 2
    radius = int(tile * radius_ratio)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        [pad, pad, pad + tile - 1, pad + tile - 1],
        radius=radius,
        fill="#33584c",
    )

    # Water sheen, kept subtle so the fish and text stay readable at small sizes.
    sheen = Image.new("RGBA", (tile, tile), (0, 0, 0, 0))
    sheen_draw = ImageDraw.Draw(sheen)
    sheen_draw.ellipse(
        [int(tile * 0.12), int(tile * 0.58), int(tile * 0.94), int(tile * 1.18)],
        fill=(90, 133, 117, 66),
    )
    sheen_draw.ellipse(
        [int(tile * 0.06), int(tile * 0.16), int(tile * 0.42), int(tile * 0.54)],
        fill=(104, 147, 128, 42),
    )
    canvas.paste(sheen, (pad, pad), sheen)

    # Stylized koi, inspired by the existing favicon, centered below the name.
    koi = Image.new("RGBA", (tile, tile), (0, 0, 0, 0))
    kd = ImageDraw.Draw(koi)
    kd.polygon(
        [(0.14 * tile, 0.47 * tile), (0.29 * tile, 0.39 * tile), (0.29 * tile, 0.57 * tile)],
        fill="#e8e2d0",
    )
    kd.ellipse(
        [0.27 * tile, 0.375 * tile, 0.72 * tile, 0.585 * tile],
        fill="#f4f1e4",
    )
    kd.ellipse(
        [0.40 * tile, 0.415 * tile, 0.50 * tile, 0.545 * tile],
        fill="#d4744a",
    )
    kd.ellipse(
        [0.55 * tile, 0.425 * tile, 0.66 * tile, 0.525 * tile],
        fill="#e79f6b",
    )
    kd.polygon(
        [(0.38 * tile, 0.565 * tile), (0.43 * tile, 0.655 * tile), (0.48 * tile, 0.565 * tile)],
        fill="#e8e2d0",
    )
    kd.polygon(
        [(0.53 * tile, 0.40 * tile), (0.56 * tile, 0.31 * tile), (0.61 * tile, 0.40 * tile)],
        fill="#e79f6b",
    )
    eye = (0.68 * tile, 0.44 * tile)
    kd.ellipse(
        [eye[0] - tile * 0.016, eye[1] - tile * 0.016, eye[0] + tile * 0.016, eye[1] + tile * 0.016],
        fill="#253831",
    )
    koi = koi.rotate(-10, resample=Image.BICUBIC, center=(0.45 * tile, 0.48 * tile))
    canvas.alpha_composite(koi, (pad, pad + int(tile * 0.20)))

    text = "摸鱼"
    font_size = int(tile * 0.345)
    candidates = [
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ]
    font = None
    for candidate in candidates:
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except OSError:
            continue
    if font is None:
        raise SystemExit("No usable CJK font found")

    text_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    text_draw = ImageDraw.Draw(text_layer)
    box = text_draw.textbbox((0, 0), text, font=font)
    width, height = box[2] - box[0], box[3] - box[1]
    x = (size - width) / 2 - box[0]
    y = size * 0.155 - box[1]
    for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3)]:
        text_draw.text((x + dx, y + dy), text, font=font, fill=(19, 34, 30, 170))
    text_draw.text((x, y), text, font=font, fill="#f7f2e6")
    canvas.alpha_composite(text_layer)

    return canvas


def write_outputs(master):
    master.save(ROOT / "assets" / "app-icon.png")
    master.resize((256, 256), Image.LANCZOS).save(ROOT / "docs" / "screenshots" / "icon.png")
    for dpi, size in [
        ("mdpi", 48),
        ("hdpi", 72),
        ("xhdpi", 96),
        ("xxhdpi", 144),
        ("xxxhdpi", 192),
    ]:
        master.resize((size, size), Image.LANCZOS).save(
            ROOT / "android" / "res" / f"mipmap-{dpi}" / "icon.png"
        )
    master.resize((432, 432), Image.LANCZOS).save(
        ROOT / "android" / "res" / "drawable-nodpi" / "icon_bg.png"
    )


if __name__ == "__main__":
    write_outputs(rounded_tile(1024))
