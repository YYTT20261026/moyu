"""为 Android 生成手机尺寸的底图与内嵌数据。

手机用不到 4K 细节：把 3840×2160 直接塞进 APK 时，内嵌 base64 会到 60 MB，WebView 要先解析
整段脚本，再解码 3840×2160 的位图（每张约 33 MB）；多数手机的 GL_MAX_TEXTURE_SIZE 只有
4096，上传时本来也会被降采样。所以这里缩到 2560×1440：静态兜底存无损 PNG，file:// 页面
内嵌高质量 JPEG（约 0.5–1 MB/张）。

产物：
  build/mobile/stills/pond-runtime.png 等  CSS 背景与静态兜底画面（2560×1440）
  build/mobile/pond-bed.js                 file:// 页面内嵌底图（JPEG q90）

用法：python scripts/prepare-mobile.py（scripts/build-android.sh 会自动调用）
"""
from io import BytesIO
from pathlib import Path
import base64
import json

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "build" / "mobile"
STILLS = OUT / "stills"
SIZE = (2560, 1440)
QUALITY = 90
NAMES = {
    "spring": "pond-runtime.png",
    "summer": "pond-summer-runtime.png",
    "autumn": "pond-autumn-runtime.png",
    "winter": "pond-winter-runtime.png",
}

STILLS.mkdir(parents=True, exist_ok=True)
images = {}
for season, name in NAMES.items():
    with Image.open(ASSETS / name) as source:
        image = source.convert("RGB")
    if image.size != SIZE:
        image = image.resize(SIZE, Image.LANCZOS)
    image.save(STILLS / name, format="PNG", optimize=True)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=QUALITY, optimize=True)
    images[season] = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    print(f"{season}: {name} {SIZE} {(STILLS / name).stat().st_size} bytes, embedded {len(images[season])} bytes")

(OUT / "pond-bed.js").write_text(
    "window.POND_IMAGES=%s;\nwindow.POND_IMAGE=window.POND_IMAGES.spring;\n"
    % json.dumps(images, separators=(",", ":")),
    encoding="utf-8",
)
print(f"已生成手机底图 {STILLS} 与内嵌数据 {OUT / 'pond-bed.js'}")
