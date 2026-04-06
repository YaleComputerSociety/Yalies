#!/bin/bash

# Starts the frontend dev server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR/yalies-external/yalies-web" || exit 1

# Copy env file from centralized config
ENV_SRC="$SCRIPT_DIR/../.config/external/.env.web"
if [ -f "$ENV_SRC" ]; then
  cp "$ENV_SRC" .env.local
else
  echo "Warning: $ENV_SRC not found"
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "Switching Node version..."
nvm use

echo "Installing dependencies..."
npm install

echo ""
echo "Starting frontend dev server..."
npm run dev
