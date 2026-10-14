#!/bin/zsh
# 摸鱼 · build the Windows installer and macOS disk image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOTNET="${DOTNET:-$ROOT/.build-tools/dotnet/dotnet}"
VERSION="1.2.1"
INSTALLER_PROJECT="$ROOT/native/windows/installer"
PAYLOAD="$INSTALLER_PROJECT/payload.zip"
OUTPUT="$ROOT/dist/摸鱼-$VERSION.exe"

echo "▸ Building Windows application package..."
DOTNET="$DOTNET" "$ROOT/scripts/build-windows.sh"

echo "▸ Embedding application package into installer..."
cp "$ROOT/dist/摸鱼-Windows-$VERSION.zip" "$PAYLOAD"

echo "▸ Publishing Windows installer..."
"$DOTNET" publish "$INSTALLER_PROJECT/Installer.csproj" \
  -c Release \
  -r win-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -o "$ROOT/build/installer" \
  --nologo -v quiet

cp "$ROOT/build/installer/MoYuSetup.exe" "$OUTPUT"

echo "✓ Built $OUTPUT"
echo "  Double-click it to install 摸鱼, create shortcuts, and add an uninstall entry."
