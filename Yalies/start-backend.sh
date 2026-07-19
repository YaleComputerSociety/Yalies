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

  # Wait until the proxy is actually accepting connections, not merely alive.
  PROXY_READY=""
  for _ in {1..30}; do
    if lsof -n -P -iTCP:1357 -sTCP:LISTEN &>/dev/null; then
      PROXY_READY=1
      break
    fi
    if ! kill -0 "$PROXY_PID" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  if [ -z "$PROXY_READY" ]; then
    echo "Error: Cloud SQL Proxy did not become ready on port 1357."
    kill "$PROXY_PID" 2>/dev/null
    wait "$PROXY_PID" 2>/dev/null
    exit 1
  fi

  echo "Cloud SQL Proxy running (PID $PROXY_PID)"
fi
echo ""

# Start the backend
cd "$SCRIPT_DIR/yalies-external/yalies-backend" || exit 1

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "Switching Node version..."
nvm install
nvm use

echo "Building yalies-shared..."
cd "$SCRIPT_DIR/yalies-shared" || exit 1
npm install
npm run build

cd "$SCRIPT_DIR/yalies-external/yalies-backend" || exit 1

echo "Installing dependencies..."
npm install

echo ""
echo "Starting backend dev server..."
npm run dev

# When the backend exits, kill the proxy only if we started it
if [ -n "$PROXY_PID" ]; then
  kill "$PROXY_PID" 2>/dev/null
fi
