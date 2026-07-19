#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  rm -rf "$SCRIPT_DIR/yalies-shared"
}

trap cleanup EXIT

echo "Building yalies-shared..."
cd "$SCRIPT_DIR/../../yalies-shared" && npm install && npm run build && cd "$SCRIPT_DIR"

echo "Copying yalies-shared..."
cp -r "$SCRIPT_DIR/../../yalies-shared" "$SCRIPT_DIR/yalies-shared"

echo "Deploying to Cloud Run..."
gcloud run deploy yalies-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --clear-base-image

echo "Deploy complete."
