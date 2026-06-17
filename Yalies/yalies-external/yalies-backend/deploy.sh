#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_LOCK_BACKUP=""

cleanup() {
  rm -rf "$SCRIPT_DIR/yalies-shared"

  if [ -n "$PACKAGE_LOCK_BACKUP" ] && [ -f "$PACKAGE_LOCK_BACKUP" ]; then
    mv "$PACKAGE_LOCK_BACKUP" "$SCRIPT_DIR/package-lock.json"
  fi
}

trap cleanup EXIT

if [ -f "$SCRIPT_DIR/package-lock.json" ]; then
  PACKAGE_LOCK_BACKUP="$(mktemp "$SCRIPT_DIR/package-lock.json.XXXXXX")"
  cp "$SCRIPT_DIR/package-lock.json" "$PACKAGE_LOCK_BACKUP"
fi

echo "Building yalies-shared..."
cd "$SCRIPT_DIR/../../yalies-shared" && npm install && npm run build && cd "$SCRIPT_DIR"

echo "Copying yalies-shared..."
cp -r "$SCRIPT_DIR/../../yalies-shared" "$SCRIPT_DIR/yalies-shared"

echo "Generating package-lock.json..."
npm install --package-lock-only

echo "Deploying to Cloud Run..."
gcloud run deploy yalies-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --clear-base-image

echo "Deploy complete."
