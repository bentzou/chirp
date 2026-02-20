#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(jq -r '.version' package.json)

jq --arg v "$VERSION" '.version = $v | .version_name = $v' src/manifest.json > src/manifest.json.tmp
mv src/manifest.json.tmp src/manifest.json

echo "Synced manifest.json to version $VERSION"
