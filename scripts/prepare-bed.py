"""从高清 PNG 原图生成网页运行底图与季节缩略图。

用法：python scripts/prepare-bed.py
源图：assets/pond.png、pond-summer.png、pond-autumn.png、pond-winter.png（7680×4320）
产物：assets/pond-runtime.png 等（保留 8K 原图分辨率，超过 8K 的源图缩到 8K）、
      assets/pond-*-thumb.jpg（320×180）

底图分辨率与坐标无关：core.js 与 scene.js 的岸线、石头、荷叶、花叶坐标固定标注在
POND_MAP 的 2560×1440 设计尺度上，由 gl.js 按该尺度映射到屏幕。换更高清的底图只会
让画面更细腻，不会移动池中的任何东西；设备纹理上限不足时渲染器会自动缩放上传。
更新原图后先运行本脚本，再运行 npm run build 重新生成内嵌数据与静态网页。
"""
from pathlib import Path
from PIL import Image
import shutil

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCES = {
    "spring": ("pond.png", "pond-runtime.png", "pond-spring-thumb.jpg"),
    "summer": ("pond-summer.png", "pond-summer-runtime.png", "pond-summer-thumb.jpg"),
    "autumn": ("pond-autumn.png", "pond-autumn-runtime.png", "pond-autumn-thumb.jpg"),
    "winter": ("pond-winter.png", "pond-winter-runtime.png", "pond-winter-thumb.jpg"),
}
BED = (7680, 4320)  # 8K 上限；运行底图在此以内保持源图分辨率
THUMB = (320, 180)

for season, (source, runtime, thumbnail) in SOURCES.items():
    image = Image.open(ASSETS / source).convert("RGB")
    if image.size == BED:
        shutil.copyfile(ASSETS / source, ASSETS / runtime)
    elif image.width > BED[0] or image.height > BED[1]:
        image.resize(BED, Image.LANCZOS).save(ASSETS / runtime, format="PNG", optimize=True)
    else:
        image.save(ASSETS / runtime, format="PNG", optimize=True)
    image.resize(THUMB, Image.LANCZOS).save(ASSETS / thumbnail, format="JPEG", quality=88)
    print(f"{season}: {runtime} {image.size} {(ASSETS / runtime).stat().st_size} bytes, {thumbnail}")
