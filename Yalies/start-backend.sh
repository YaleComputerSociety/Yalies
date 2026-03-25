#!/bin/bash

# Starts the Cloud SQL Proxy and the backend dev server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PROXY_PID=""

# Check if proxy is already running on the expected port
if lsof -i :1357 &>/dev/null; then
  echo "Cloud SQL Proxy already running on port 1357, skipping..."
else
  echo "Starting Cloud SQL Proxy..."
  "$SCRIPT_DIR/start-proxy.sh" &
  PROXY_PID=$!

  sleep 2

  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Error: Cloud SQL Proxy failed to start."
    exit 1
  fi

  echo "Cloud SQL Proxy running (PID $PROXY_PID)"
fi
echo ""

# Start the backend
cd "$SCRIPT_DIR/yalies-backend" || exit 1

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "Switching Node version..."
nvm use

echo "Installing dependencies..."
npm install

echo ""
echo "Starting backend dev server..."
npm run dev

# When the backend exits, kill the proxy only if we started it
if [ -n "$PROXY_PID" ]; then
  kill "$PROXY_PID" 2>/dev/null
fi
