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

echo "Building..."
NEXT_PUBLIC_YALIES_API_URL="https://yalies-backend-335460719231.us-central1.run.app" npx next build

echo "Deploying to Firebase..."
firebase experiments:enable webframeworks
firebase deploy --only hosting

echo "Cleaning up..."
npm pkg set dependencies.yalies-shared="file:../../yalies-shared"
rm -rf "$SCRIPT_DIR/yalies-shared"

echo "Deploy complete."
