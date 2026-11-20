#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/yalies-admin.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
node "$ROOT/scripts/deploy/stage.mjs" "$STAGE"
# Include new source files while preparing the initial access-management rollout.
cp -R "$ROOT/apps/pipeline/src/." "$STAGE/apps/pipeline/src/"
cp -R "$ROOT/apps/dashboard/src/." "$STAGE/apps/dashboard/src/"
cp "$ROOT/deploy/admin/Dockerfile" "$STAGE/Dockerfile"
gcloud run deploy yalies-admin --source "$STAGE" --project yalies --region us-central1 \
  --allow-unauthenticated --clear-base-image --max-instances=1 --timeout=3600 "$@"
