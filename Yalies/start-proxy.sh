#!/bin/bash

# Cloud SQL Auth Proxy startup script
# Reads DEV_MODE from .env to select the correct Cloud SQL instance

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.config/.env.proxy"

CREDENTIALS_FILE="$SCRIPT_DIR/../.config/gcloud/service-key.json"
PORT=1357

# Read DEV_MODE from .env
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

DEV_MODE=$(grep -m1 '^DEV_MODE=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")

if [ -z "$DEV_MODE" ]; then
  echo "Error: DEV_MODE not set in .env"
  exit 1
fi

# Select instance based on DEV_MODE
PROD_INSTANCE=$(grep -m1 '^CLOUD_SQL_PROD_INSTANCE=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
DEV_INSTANCE=$(grep -m1 '^CLOUD_SQL_DEV_INSTANCE=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")

if [ "$DEV_MODE" = "production" ]; then
  INSTANCE="$PROD_INSTANCE"
elif [ "$DEV_MODE" = "development" ]; then
  INSTANCE="$DEV_INSTANCE"
else
  echo "Error: DEV_MODE must be 'production' or 'development', got '$DEV_MODE'"
  exit 1
fi

if [ -z "$INSTANCE" ]; then
  echo "Error: No Cloud SQL instance found for DEV_MODE=$DEV_MODE"
  exit 1
fi

EXISTING_PROXY="$(lsof -n -P -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')"
if [ -n "$EXISTING_PROXY" ]; then
  EXISTING_ARGS="$(ps -p "$EXISTING_PROXY" -o args= 2>/dev/null || true)"
  echo "Cloud SQL Proxy port $PORT is already in use."
  echo "  PID:       $EXISTING_PROXY"
  echo "  Command:   $EXISTING_ARGS"
  echo "  Requested: $INSTANCE"
  if echo "$EXISTING_ARGS" | grep -q "$INSTANCE"; then
    echo ""
    echo "Existing proxy already points at the requested instance; leaving it running."
    exit 0
  fi
  echo ""
  echo "Existing proxy points at a different instance. Stop it first:"
  echo "  kill $EXISTING_PROXY"
  exit 1
fi

if ! command -v cloud-sql-proxy &> /dev/null; then
  echo "Error: cloud-sql-proxy not found. Install it with:"
  echo "  brew install cloud-sql-proxy"
  exit 1
fi

echo "==================================="
echo "  DEV_MODE:  $DEV_MODE"
echo "  Instance:  $INSTANCE"
echo "  Port:      $PORT"
if [ -s "$CREDENTIALS_FILE" ]; then
  echo "  Auth:      service account key"
else
  echo "  Auth:      gcloud application default credentials"
fi
echo "==================================="
echo ""
echo "Starting Cloud SQL Proxy..."
if [ -s "$CREDENTIALS_FILE" ]; then
  cloud-sql-proxy --port "$PORT" --credentials-file="$CREDENTIALS_FILE" "$INSTANCE"
else
  cloud-sql-proxy --port "$PORT" "$INSTANCE"
fi
