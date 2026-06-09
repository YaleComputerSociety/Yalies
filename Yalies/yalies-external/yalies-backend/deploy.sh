#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Copying yalies-shared..."
cp -r "$SCRIPT_DIR/../../yalies-shared" "$SCRIPT_DIR/yalies-shared"

echo "Generating package-lock.json..."
npm install --package-lock-only

echo "Deploying to Cloud Run..."
gcloud run deploy yalies-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated

echo "Cleaning up..."
rm -rf "$SCRIPT_DIR/yalies-shared"
rm -f "$SCRIPT_DIR/package-lock.json"

echo "Deploy complete."
