#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(jq -r '.version' package.json)

jq --arg v "$VERSION" '.version = $v | .version_name = $v' manifest.json > manifest.json.tmp
mv manifest.json.tmp manifest.json

echo "Synced manifest.json to version $VERSION"
