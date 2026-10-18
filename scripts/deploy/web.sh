#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/yalies-web-workspace.XXXXXX")"
SOURCE="$(mktemp -d "${TMPDIR:-/tmp}/yalies-web-firebase.XXXXXX")"
trap 'rm -rf "$STAGE" "$SOURCE"' EXIT
node "$ROOT/scripts/deploy/stage.mjs" "$STAGE"
cd "$STAGE"
export NEXT_PUBLIC_YALIES_API_URL="https://api.yalies.io"
npm ci
node scripts/deploy/prepare-web.mjs "$SOURCE"
cd "$SOURCE"
npm ci
firebase experiments:enable webframeworks
firebase deploy --only hosting --project yalies
