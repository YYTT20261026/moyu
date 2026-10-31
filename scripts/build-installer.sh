#!/bin/zsh
# 摸鱼 · build the Windows installer and macOS disk image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOTNET="${DOTNET:-$ROOT/.build-tools/dotnet/dotnet}"
VERSION="1.2.5"
INSTALLER_PROJECT="$ROOT/native/windows/installer"
PAYLOAD="$INSTALLER_PROJECT/payload.zip"
OUTPUT="$ROOT/dist/摸鱼-$VERSION.exe"
INSTALLER_INTERMEDIATE="$INSTALLER_PROJECT/bin"

echo "▸ Building Windows application package..."
DOTNET="$DOTNET" "$ROOT/scripts/build-windows.sh"

echo "▸ Cleaning old installer output that would pollute the net48 assembly search path..."
rm -rf "$INSTALLER_INTERMEDIATE" "$INSTALLER_PROJECT/obj"

echo "▸ Embedding application package into installer..."
# Flat payload: the installer copies every entry straight into the install folder (its shortcuts and
# launch point at <folder>\BichiPond.exe), so the portable zip's wrapping folder must not be inside.
(cd "$ROOT/build/windows/BichiPond" && zip -qr -X "$PAYLOAD" .)

echo "▸ Building the Windows installer (.NET Framework 4.8, no self-extraction)..."
# A plain net48 executable, like BichiPond.exe itself: it starts from any folder, needs no administrator
# rights and does not unpack itself into %TEMP%, so nothing about where the file sits can break it.
"$DOTNET" build "$INSTALLER_PROJECT/Installer.csproj" \
  -c Release \
  -o "$ROOT/build/installer" \
  --nologo -v quiet

cp "$ROOT/build/installer/MoYuSetup.exe" "$OUTPUT"

# Leave nothing behind that could pollute the net48 assembly search path of a later app build.
rm -rf "$INSTALLER_INTERMEDIATE" "$INSTALLER_PROJECT/obj"

echo "✓ Built $OUTPUT"
echo "  Double-click it to install 摸鱼, create shortcuts, and add an uninstall entry."
