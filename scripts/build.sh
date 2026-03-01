#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(jq -r '.version' package.json)
OUTDIR="dist"
ZIPNAME="chirp-v${VERSION}.zip"

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

cd src && zip -r "../$OUTDIR/$ZIPNAME" .

echo "Built $OUTDIR/$ZIPNAME"
