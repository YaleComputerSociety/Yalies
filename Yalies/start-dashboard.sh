#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/yalies-internal/yalies-dashboard" || exit 1

# Copy env file from centralized config
ENV_SRC="$SCRIPT_DIR/../.config/internal/.env.dashboard"
if [ -f "$ENV_SRC" ]; then
  cp "$ENV_SRC" .env.local
else
  echo "Warning: $ENV_SRC not found"
fi

echo "Starting dashboard on port 3001..."
npm run dev
