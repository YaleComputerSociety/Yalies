#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_JSON_BACKUP=""
PACKAGE_LOCK_BACKUP=""
ENV_LOCAL_BACKUP=""

if [ -f "$SCRIPT_DIR/.nvmrc" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  unset npm_config_prefix
  unset NPM_CONFIG_PREFIX
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install "$(cat "$SCRIPT_DIR/.nvmrc")"
  nvm use "$(cat "$SCRIPT_DIR/.nvmrc")"
fi

export npm_config_cache="$SCRIPT_DIR/.npm-cache"
mkdir -p "$npm_config_cache"

cleanup() {
  if [ -n "$ENV_LOCAL_BACKUP" ] && [ -f "$ENV_LOCAL_BACKUP" ]; then
    mv "$ENV_LOCAL_BACKUP" "$SCRIPT_DIR/.env.local"
  fi

  if [ -n "$PACKAGE_JSON_BACKUP" ] && [ -f "$PACKAGE_JSON_BACKUP" ]; then
    mv "$PACKAGE_JSON_BACKUP" "$SCRIPT_DIR/package.json"
  fi

  if [ -n "$PACKAGE_LOCK_BACKUP" ] && [ -f "$PACKAGE_LOCK_BACKUP" ]; then
    mv "$PACKAGE_LOCK_BACKUP" "$SCRIPT_DIR/package-lock.json"
  fi

  rm -rf "$SCRIPT_DIR/yalies-shared"
}

trap cleanup EXIT

PACKAGE_JSON_BACKUP="$(mktemp "$SCRIPT_DIR/package.json.XXXXXX")"
cp "$SCRIPT_DIR/package.json" "$PACKAGE_JSON_BACKUP"

if [ -f "$SCRIPT_DIR/package-lock.json" ]; then
  PACKAGE_LOCK_BACKUP="$(mktemp "$SCRIPT_DIR/package-lock.json.XXXXXX")"
  cp "$SCRIPT_DIR/package-lock.json" "$PACKAGE_LOCK_BACKUP"
fi

echo "Building yalies-shared..."
cd "$SCRIPT_DIR/../../yalies-shared" && npm install && npm run build && cd "$SCRIPT_DIR"

echo "Copying yalies-shared..."
cp -r "$SCRIPT_DIR/../../yalies-shared" "$SCRIPT_DIR/yalies-shared"

echo "Pointing package.json at local yalies-shared..."
npm pkg set dependencies.yalies-shared="file:./yalies-shared"

echo "Installing dependencies..."
npm install

# Hide .env.local so Firebase's build uses .env.production instead
if [ -f .env.local ]; then
  ENV_LOCAL_BACKUP="$SCRIPT_DIR/.env.local.bak"
  mv .env.local "$ENV_LOCAL_BACKUP"
fi

echo "Deploying to Firebase..."
firebase experiments:enable webframeworks
firebase deploy --only hosting

echo "Deploy complete."
