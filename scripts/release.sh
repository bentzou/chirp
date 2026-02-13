#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:?Usage: npm run release -- <patch|minor|major>}"

npm version "$BUMP"
npm run build

VERSION=$(jq -r '.version' package.json)

echo ""
echo "Release v${VERSION} ready!"
echo ""
echo "Next steps:"
echo "  git push && git push --tags"
echo "  Upload dist/chirpy-v${VERSION}.zip to Chrome Web Store"
