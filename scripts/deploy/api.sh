#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/yalies-api.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
node "$ROOT/scripts/deploy/stage.mjs" "$STAGE"
cp "$ROOT/apps/api/Dockerfile" "$STAGE/Dockerfile"
gcloud run deploy yalies-backend --source "$STAGE" --project yalies --region us-central1 --allow-unauthenticated --clear-base-image "$@"
gcloud run services update-traffic yalies-backend --project yalies --region us-central1 --to-latest
