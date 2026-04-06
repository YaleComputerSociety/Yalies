#!/bin/bash

# Rebuilds yalies-shared and reinstalls it in all consumer packages

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Building yalies-shared..."
cd "$SCRIPT_DIR/yalies-shared" || exit 1
npm run build || exit 1

echo ""
echo "Reinstalling in consumer packages..."

for pkg in \
  "$SCRIPT_DIR/yalies-external/yalies-backend" \
  "$SCRIPT_DIR/yalies-external/yalies-web" \
  "$SCRIPT_DIR/yalies-internal/yalies-data-pipeline" \
  "$SCRIPT_DIR/yalies-internal/yalies-dashboard"
do
  name=$(basename "$pkg")
  echo "  $name..."
  cd "$pkg" && npm install --no-audit --no-fund yalies-shared > /dev/null 2>&1
done

echo ""
echo "Done. All packages using latest yalies-shared."
