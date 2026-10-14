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
  --project yalies \
  --region us-central1 \
  --allow-unauthenticated \
  --clear-base-image \
  "$@"

# A previously pinned revision can retain traffic after a successful deployment.
# Explicitly activate the new backend instead of leaving the old search code live.
gcloud run services update-traffic yalies-backend \
  --project yalies \
  --region us-central1 \
  --to-latest

echo "Deploy complete."
