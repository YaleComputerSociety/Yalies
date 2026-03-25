#!/bin/bash

# Starts the frontend dev server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR/yalies-web" || exit 1

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "Switching Node version..."
nvm use

echo "Installing dependencies..."
npm install

echo ""
echo "Starting frontend dev server..."
npm run dev
