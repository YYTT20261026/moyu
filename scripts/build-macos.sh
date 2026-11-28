#!/bin/zsh
# MoYu · build the standalone macOS desktop-wallpaper app into dist/MoYu.app,
# an Apple-silicon (arm64) binary for macOS 12+, plus a drag-to-install disk image.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/MoYu.app"
CONTENTS="$APP/Contents"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$ROOT/native/macos/Info.plist")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

rm -rf "$APP"
find "$ROOT/dist" -maxdepth 1 -name "MoYu-$VERSION-macOS-*.dmg" -delete 2>/dev/null || true
rm -f "$ROOT/dist/MoYu-$VERSION.dmg"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources/assets"

echo "▸ Refreshing embedded artwork and audio…"
node "$ROOT/scripts/embed.mjs"

echo "▸ Compiling Swift wrapper (arm64)…"
swiftc -O -swift-version 5 -module-cache-path "$WORK/module-cache" -target "arm64-apple-macos12.0" -o "$CONTENTS/MacOS/BichiPond" "$ROOT/native/macos/main.swift"
BUILT="$(lipo -archs "$CONTENTS/MacOS/BichiPond")"
DMG="$ROOT/dist/MoYu-$VERSION-macOS-arm64.dmg"
echo "  → $BUILT"

echo "▸ Bundling web app…"
cp "$ROOT/native/macos/Info.plist" "$CONTENTS/Info.plist"
plutil -lint -s "$CONTENTS/Info.plist"
for f in index.html app.js core.js art.js gl.js scene.js audio.js style.css; do
  cp "$ROOT/$f" "$CONTENTS/Resources/$f"
done
cp "$ROOT"/assets/pond*runtime.png "$ROOT"/assets/pond-*-thumb.jpg "$ROOT/assets/pond-data.js" "$ROOT/assets/pond-bed.js" "$ROOT/assets/audio-data.js" "$ROOT/assets/lotus-original.png" "$ROOT/assets/drifting-flora.png" "$ROOT/assets/drifting-flora.json" "$ROOT/assets/favicon.svg" "$CONTENTS/Resources/assets/"
# Only the attribution: the recordings themselves are embedded in audio-data.js.
mkdir -p "$CONTENTS/Resources/assets/audio"
cp "$ROOT/assets/audio/SOURCES.md" "$CONTENTS/Resources/assets/audio/"

echo "▸ Generating app icon…"
# assets/app-icon.png: 1024 px, drawn on Apple's icon grid (824 px rounded square with its own shadow).
ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -s format png -z $size $size "$ROOT/assets/app-icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -s format png -z $((size * 2)) $((size * 2)) "$ROOT/assets/app-icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
# macOS 27's iconutil rejects iconsets sips just wrote (`Invalid Iconset`), so fall back to Pillow.
if ! iconutil -c icns -o "$CONTENTS/Resources/AppIcon.icns" "$ICONSET" 2>/dev/null; then
  PYTHON="${PYTHON:-$(command -v python3)}"
  if [ -n "$PYTHON" ] && "$PYTHON" -c 'import PIL.Image' 2>/dev/null; then
    "$PYTHON" - "$ROOT/assets/app-icon.png" "$CONTENTS/Resources/AppIcon.icns" <<'PY'
import sys
from PIL import Image
Image.open(sys.argv[1]).convert("RGBA").save(sys.argv[2], format="ICNS")
PY
  else
    echo "  (iconutil failed and Pillow is unavailable; the app keeps its bundle icon without a custom .icns)"
  fi
fi

echo "▸ Signing (ad-hoc)…"
codesign --force --deep --sign - "$APP"
codesign --verify --strict "$APP"

echo "▸ Packing disk image…"
STAGE="$WORK/dmg"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/MoYu.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "MoYu" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"

echo "✓ Built $APP ($BUILT)"
echo "✓ Packed $DMG"
echo "  Double-click the app, and the pond becomes your desktop background."
echo "  Control it from the 🐟 item in the menu bar."
