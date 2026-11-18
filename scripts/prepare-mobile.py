"""为 Android 生成手机尺寸的底图与内嵌数据。

8K 底图不适合直接放进 APK：内嵌脚本会到 169 MB，WebView 要先解析整段脚本，再解码
7680×4320 的位图（每张约 132 MB），中低端机容易内存溢出或长时间白屏；而且多数手机的
GL_MAX_TEXTURE_SIZE 只有 4096，8K 纹理本来也会被降采样。手机屏幕用不到 8K 细节。

产物：
  build/mobile/stills/pond-runtime.png 等  CSS 背景与静态兜底画面（文件名与 SEASONS 路径一致）
  build/mobile/pond-bed.js                 file:// 页面内嵌底图（高质量 JPEG，约 0.5–1 MB/张）

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
    image = Image.open(ASSETS / name).convert("RGB")
    if image.size != SIZE:
        image = image.resize(SIZE, Image.LANCZOS)
    image.save(STILLS / name, format="PNG", optimize=True)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=QUALITY, optimize=True)
    images[season] = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    print(f"{season}: {name} {(STILLS / name).stat().st_size} bytes, embedded {len(images[season])} bytes")

(OUT / "pond-bed.js").write_text(
    "window.POND_IMAGES=%s;\nwindow.POND_IMAGE=window.POND_IMAGES.spring;\n"
    % json.dumps(images, separators=(",", ":")),
    encoding="utf-8",
)
print(f"已生成手机底图 {STILLS} 与内嵌数据 {OUT / 'pond-bed.js'}")
