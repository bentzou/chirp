#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(jq -r '.version' package.json)
OUTDIR="dist"
ZIPNAME="chirpy-v${VERSION}.zip"

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

zip -r "$OUTDIR/$ZIPNAME" \
  manifest.json \
  background.js \
  content.js \
  popup.js \
  popup.html \
  content.css \
  popup.css \
  bubble.css \
  tooltip.html \
  tooltip.js \
  welcome.html \
  welcome.css \
  welcome.js \
  icons/ \
  lib/

echo "Built $OUTDIR/$ZIPNAME"
