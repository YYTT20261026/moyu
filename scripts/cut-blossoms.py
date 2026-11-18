#!/usr/bin/env python3
"""Cut the cherry blossoms hanging over the spring pond into independent sprites.

The bunches stay in the painting, so every sprite is a straight copy of the runtime bed
(assets/pond-runtime.png) at its own coordinates: drawn back at rest it is invisible, and only the
feathered alpha edge lets it sway without dragging a patch of water along. Output is an
atlas plus the source rectangles and the pivot each bunch turns around.
"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BED = ROOT / "assets" / "pond-runtime.png"
ATLAS = ROOT / "assets" / "blossom-original.png"
LAYOUT = ROOT / "assets" / "blossom-original.json"

PAD = 8
SHELF = 1024

# (x, y, w, h, pivot x, pivot y) in bed pixels: [x, y, w, h, px, py]
# Pivot is the branch the bunch hangs from: the top edge along the overhanging bough,
# the right edge for the flowers that pour in from the right.
BUNCHES = [
    [1650, 0, 215, 205, .55, .05],
    [1855, 0, 215, 165, .50, .05],
    [2015, 0, 235, 160, .45, .05],
    [2225, 0, 200, 175, .55, .05],
    [2390, 0, 170, 215, .45, .05],
    [2480, 175, 80, 190, .95, .10],
    [2185, 118, 195, 155, .85, .12],
    [2285, 280, 145, 125, .90, .20],
    [2405, 330, 155, 135, .95, .15],
    [2305, 450, 155, 115, .90, .20],
    [2235, 505, 185, 125, .90, .15],
    [2455, 505, 105, 115, .95, .20],
    [2165, 585, 175, 125, .90, .20],
    [2405, 578, 155, 105, .95, .20],
    [2175, 688, 135, 125, .85, .20],
    [2395, 745, 165, 115, .95, .20],
    [2480, 675, 80, 175, .95, .15],
    [1825, 228, 155, 125, .55, .30],
]


def alpha_of(crop):
    """Petals and twigs of a bunch, with a soft edge and a faded rim."""
    b, g, r = (crop[:, :, i].astype(np.int16) for i in range(3))
    # Pond water is teal: green and blue sit well above red. Petals, even in shade,
    # are neutral or warm, and the twigs are warmer still.
    warm = r - (g + b) // 2
    mask = (warm > -12).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), 3.2)
    h, w = soft.shape
    ramp = 12
    fy = np.clip(np.minimum(np.arange(h), np.arange(h)[::-1]) / ramp, 0, 1)
    fx = np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / ramp, 0, 1)
    border = np.outer(fy, fx) ** .6
    return np.clip(soft * border, 0, 1)


def main():
    bed = cv2.imread(str(BED))
    H, W = bed.shape[:2]
    tiles = []
    for x, y, w, h, px, py in BUNCHES:
        x2, y2 = min(x + w, W), min(y + h, H)
        crop = bed[y:y2, x:x2]
        alpha = alpha_of(crop)
        rgba = np.dstack([crop, (alpha * 255).astype(np.uint8)])
        tiles.append({"rgba": rgba, "ix": x, "iy": y, "w": x2 - x, "h": y2 - y, "px": px, "py": py})

    tiles.sort(key=lambda t: -t["h"])
    x = y = shelf = 0
    sheet_w = 0
    for t in tiles:
        if x + t["w"] + PAD > SHELF:
            x = 0
            y += shelf + PAD
            shelf = 0
        t["tx"], t["ty"] = x, y
        x += t["w"] + PAD
        shelf = max(shelf, t["h"])
        sheet_w = max(sheet_w, t["tx"] + t["w"])
    sheet_h = y + shelf

    sheet = np.zeros((sheet_h, sheet_w, 4), np.uint8)
    for t in tiles:
        sheet[t["ty"]:t["ty"] + t["h"], t["tx"]:t["tx"] + t["w"]] = t["rgba"]

    cv2.imwrite(str(ATLAS), sheet, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    layout = {"spring": [
        {"sprite": f"blossom{i}", "ix": t["ix"], "iy": t["iy"], "w": t["w"], "h": t["h"],
         "tx": t["tx"], "ty": t["ty"], "px": t["px"], "py": t["py"]}
        for i, t in enumerate(tiles)
    ]}
    LAYOUT.write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    area = sum(t["w"] * t["h"] for t in tiles)
    print(f"花束图集 {ATLAS.name} {sheet_w}×{sheet_h}，{len(tiles)} 束，占 {area} 像素")
    print(f"坐标写入 {LAYOUT.name}")


if __name__ == "__main__":
    main()
