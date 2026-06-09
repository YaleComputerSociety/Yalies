#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Building yalies-shared..."
cd "$SCRIPT_DIR/../../yalies-shared" && npm install && npm run build && cd "$SCRIPT_DIR"

echo "Copying yalies-shared..."
cp -r "$SCRIPT_DIR/../../yalies-shared" "$SCRIPT_DIR/yalies-shared"

echo "Pointing package.json at local yalies-shared..."
npm pkg set dependencies.yalies-shared="file:./yalies-shared"

echo "Installing dependencies..."
npm install

# Hide .env.local so Firebase's build uses .env.production instead
[ -f .env.local ] && mv .env.local .env.local.bak

echo "Deploying to Firebase..."
firebase experiments:enable webframeworks
firebase deploy --only hosting

echo "Cleaning up..."
[ -f .env.local.bak ] && mv .env.local.bak .env.local
npm pkg set dependencies.yalies-shared="file:../../yalies-shared"
rm -rf "$SCRIPT_DIR/yalies-shared"

echo "Deploy complete."
