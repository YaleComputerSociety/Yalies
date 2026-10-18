#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="yalies"
REGION="us-central1"
SERVICE="yalies-search-preview"
ORIGIN="https://${SERVICE}-335460719231.${REGION}.run.app"
: "${PREVIEW_ENV_FILE:?Set PREVIEW_ENV_FILE to a private JSON file containing the development DATABASE_URL}"

PREVIEW_WORK="$(mktemp -d "${TMPDIR:-/tmp}/yalies-search-preview.XXXXXX")"
trap 'rm -rf "$PREVIEW_WORK"' EXIT
chmod 700 "$PREVIEW_WORK"
gcloud sql instances describe yalies-sql-dev --project "$PROJECT" --format=json > "$PREVIEW_WORK/dev-instance.json"

node --input-type=module - "$PREVIEW_ENV_FILE" "$PREVIEW_WORK" "$REPO_DIR" "$ORIGIN" <<'JS'
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const [envFile, work, repo, origin] = process.argv.slice(2);
const instance = JSON.parse(fs.readFileSync(path.join(work, "dev-instance.json"), "utf8"));
const devIp = instance.ipAddresses.find(address => address.type === "PRIVATE")?.ipAddress;
const source = JSON.parse(fs.readFileSync(envFile, "utf8"));
if (!devIp || new URL(source.DATABASE_URL).hostname !== devIp.trim()) {
    throw new Error("Preview DATABASE_URL must target the private IP of yalies-sql-dev. Production databases are refused.");
}
fs.writeFileSync(path.join(work, "runtime.json"), JSON.stringify({
    DATABASE_URL: source.DATABASE_URL,
    SESSION_SECRET: source.SESSION_SECRET || crypto.randomBytes(48).toString("hex"),
    FRONTEND_URL: origin,
    AUTH_MODE: "cas",
    FACECHECK_ENABLED: "false",
    PREVIEW_READ_ONLY: "true",
}), { mode: 0o600 });

JS

node "$REPO_DIR/scripts/deploy/stage.mjs" "$PREVIEW_WORK/source"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/${SERVICE}:$(date -u +%Y%m%d-%H%M%S)"
gcloud builds submit "$PREVIEW_WORK/source" \
  --project "$PROJECT" \
  --config "$REPO_DIR/deploy/preview/cloudbuild.yaml" \
  --substitutions "_IMAGE=${IMAGE},_PREVIEW_ORIGIN=${ORIGIN}" \
  --quiet

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --env-vars-file "$PREVIEW_WORK/runtime.json" \
  --network default --subnet default --vpc-egress private-ranges-only \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 2 \
  --allow-unauthenticated --quiet

echo "Development preview: $ORIGIN"
