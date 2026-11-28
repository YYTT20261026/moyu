"""为 file:// 页面生成 4K 底图的 JPEG q90 内嵌数据。

http(s) 页面（Windows 虚拟域名、开发服务器、网站）直接加载 `assets/pond*-runtime.png`
（无损 4K）；只有 file:// 页面（双击打开 HTML、Wallpaper Engine、macOS 应用）需要把像素
内嵌成 data URL，WebGL 才能读取。把这四张 4K PNG 以 JPEG q90 再编码，内嵌数据从约 60 MB
降到约 10 MB，离线打开仍是 4K 画面。

输出 JSON 到 stdout，由 `scripts/embed.mjs` 写进 `assets/pond-bed.js`。
"""
import base64
import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SIZE = (3840, 2160)
QUALITY = 90
NAMES = {
    "spring": "pond-runtime.png",
    "summer": "pond-summer-runtime.png",
    "autumn": "pond-autumn-runtime.png",
    "winter": "pond-winter-runtime.png",
}

images = {}
for season, name in NAMES.items():
    with Image.open(ASSETS / name) as source:
        image = source.convert("RGB")
    if image.size != SIZE:
        raise ValueError(f"{name}: 必须为 3840×2160，请先运行 scripts/prepare-bed.py")
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=QUALITY, optimize=True)
    images[season] = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    print(f"{season}: {name} -> JPEG q{QUALITY} {len(images[season])} bytes", file=sys.stderr)

sys.stdout.write(json.dumps(images, separators=(",", ":")))
