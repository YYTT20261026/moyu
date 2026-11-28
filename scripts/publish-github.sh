#!/bin/zsh
# MoYu · publish to GitHub: create the public repository (if needed), push, and release every app.
# Needs the GitHub CLI signed in to the owning account:  gh auth login
# Builds are taken from dist/ (run the scripts/build-*.sh first), renamed to plain ASCII for the release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${REPO:-YYTT20261026/moyu}"
VERSION="${VERSION:-1.2.8}"
GH="${GH:-$(command -v gh || true)}"
[[ -n "$GH" ]] || { echo "GitHub CLI not found: https://cli.github.com (or set GH=/path/to/gh)"; exit 1; }
"$GH" auth status >/dev/null 2>&1 || { echo "Sign in first:  gh auth login"; exit 1; }
cd "$ROOT"

echo "▸ Collecting the apps…"
OUT="$ROOT/build/release"; rm -rf "$OUT"; mkdir -p "$OUT"
# The dmg is built on a Mac. Publishing from Windows/Linux must not fail without it; build it
# later on a Mac and upload the arch-named file.
found=0
for dmg in "dist/MoYu-$VERSION-macOS-"*.dmg(N); do
  cp "$dmg" "$OUT/$(basename "$dmg")"
  found=1
done
if [ "$found" = 0 ] && [ -f "dist/MoYu-$VERSION.dmg" ]; then
  cp "dist/MoYu-$VERSION.dmg" "$OUT/MoYu-$VERSION-macOS.dmg"
  found=1
fi
if [ "$found" = 0 ]; then
  echo "  (no macOS dmg in dist; build it on a Mac and upload afterwards)"
fi
cp "dist/MoYu-Windows-$VERSION.zip" "$OUT/MoYu-$VERSION-Windows.zip"
cp "dist/MoYu.apk" "$OUT/MoYu-$VERSION-Android.apk"
cp "dist/MoYu-$VERSION.exe" "$OUT/MoYu-$VERSION.exe"
(cd dist && zip -qr -X "$OUT/MoYu-$VERSION-Web.zip" index.html style.css core.js art.js gl.js scene.js audio.js app.js project.json assets -x '*.DS_Store')
(cd "$OUT" && shasum -a 256 MoYu-* > SHA256SUMS.txt)

echo "▸ Repository $REPO…"
if ! "$GH" repo view "$REPO" >/dev/null 2>&1; then
  "$GH" repo create "$REPO" --public --description "MoYu · 锦鲤池塘动态壁纸（macOS / Windows / Android / Web）"
fi
"$GH" auth setup-git
# Push to the repository this release targets, not to a possibly different "origin" (an upstream fork).
git push "https://github.com/$REPO.git" HEAD:main

echo "▸ Release v$VERSION…"
NOTES="docs/release-notes-$VERSION.md"
if "$GH" release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  "$GH" release upload "v$VERSION" "$OUT"/* --repo "$REPO" --clobber
else
  "$GH" release create "v$VERSION" "$OUT"/* --repo "$REPO" --title "MoYu v$VERSION" --notes-file "$NOTES"
fi
echo "✓ https://github.com/$REPO/releases/tag/v$VERSION"
