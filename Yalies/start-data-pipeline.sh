#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Bootstrapping yalies-shared..."
cd "$SCRIPT_DIR/yalies-shared" || exit 1

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "Switching Node version..."
cd "$SCRIPT_DIR/yalies-internal/yalies-data-pipeline" || exit 1
nvm use

echo ""
cd "$SCRIPT_DIR/yalies-shared" || exit 1
echo "Installing shared dependencies..."
npm install

echo "Building yalies-shared..."
npm run build

echo ""
cd "$SCRIPT_DIR/yalies-internal/yalies-data-pipeline" || exit 1

echo "Installing data pipeline dependencies..."
npm install

echo ""
ENV_FILE="$SCRIPT_DIR/../.config/internal/.env.data-pipeline"
if [ ! -f "$ENV_FILE" ]; then
	echo "ERROR: $ENV_FILE not found."
	echo "The server needs DATABASE_URL, SESSION_SECRET, AUTH_MODE, DASHBOARD_URL — see yalies-internal/README.md."
	exit 1
fi

echo "Starting data pipeline API server on port 8080..."
npm run server
