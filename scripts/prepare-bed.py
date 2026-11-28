"""验证四季 4K 权威底图并生成季节缩略图。

用法：python scripts/prepare-bed.py
唯一底图：assets/pond-runtime.png、pond-summer-runtime.png、pond-autumn-runtime.png、
          pond-winter-runtime.png（3840×2160，无损 PNG）
产物：assets/pond-*-thumb.jpg（320×180）

构建只读取并验证现有 4K PNG，不重编码、不缩放、不改写底图；不依赖更高分辨率原图。
标注保持 POND_MAP 的 2560×1440 设计尺度，不移动池中任何元素。
各平台通过 embed.mjs 自动运行本脚本，再同步 PNG 与离线内嵌数据。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCES = {
    "spring": ("pond-runtime.png", "pond-spring-thumb.jpg"),
    "summer": ("pond-summer-runtime.png", "pond-summer-thumb.jpg"),
    "autumn": ("pond-autumn-runtime.png", "pond-autumn-thumb.jpg"),
    "winter": ("pond-winter-runtime.png", "pond-winter-thumb.jpg"),
}
BED = (3840, 2160)
THUMB = (320, 180)

# Validate all four before updating any thumbnails; a stale/malformed bed must fail the build.
for season, (runtime, thumbnail) in SOURCES.items():
    with Image.open(ASSETS / runtime) as image:
        if image.format != "PNG" or image.size != BED:
            raise ValueError(f"{runtime}: 必须为 {BED[0]}×{BED[1]} 的无损 PNG，不允许构建时自动缩放")
        image.verify()

for season, (runtime, thumbnail) in SOURCES.items():
    with Image.open(ASSETS / runtime) as image:
        image.convert("RGB").resize(THUMB, Image.Resampling.LANCZOS).save(
            ASSETS / thumbnail, format="JPEG", quality=88
        )
    print(f"{season}: validated {runtime} {BED} {(ASSETS / runtime).stat().st_size} bytes, {thumbnail}")
