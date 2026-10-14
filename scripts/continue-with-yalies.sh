#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/Yalies/yalies-external/yalies-backend"
FRONTEND="$ROOT/Yalies/yalies-external/yalies-web"
STATE="$ROOT/.config/continue-with-yalies"
PROJECT=yalies
REGION=us-central1
mkdir -p "$STATE"

traffic() {
  gcloud run services describe "$1" --project "$PROJECT" --region "$REGION" --format='json(status.traffic)' |
    python3 -c 'import json,sys; rows=json.load(sys.stdin)["status"]["traffic"]; live=[r for r in rows if r.get("percent",0)>0]; assert sum(r["percent"] for r in live)==100; print(",".join(r["revisionName"]+"="+str(r["percent"]) for r in live))'
}

if [[ "${1:-}" == rollback ]]; then
  CHECKPOINT="${2:-$(cat "$STATE/last-checkpoint" 2>/dev/null || true)}"
  [[ -n "$CHECKPOINT" && -f "$CHECKPOINT/frontend-channel" ]] || { echo 'No completed rollback checkpoint found.' >&2; exit 1; }
  # Try every restoration even if one provider operation fails.
  RESULT=0
  gcloud run services update-traffic yalies-backend --project "$PROJECT" --region "$REGION" --to-revisions="$(cat "$CHECKPOINT/backend-traffic")" || RESULT=1
  gcloud run services update-traffic ssryalies --project "$PROJECT" --region "$REGION" --to-revisions="$(cat "$CHECKPOINT/frontend-traffic")" || RESULT=1
  (cd "$FRONTEND" && firebase hosting:clone "yalies:$(cat "$CHECKPOINT/frontend-channel")" yalies:live --project "$PROJECT") || RESULT=1
  echo "Rollback used checkpoint: $CHECKPOINT (exit status $RESULT). OAuth tables and secrets were retained."
  exit "$RESULT"
fi

[[ "${1:-}" == deploy ]] || { echo 'Usage: bash scripts/continue-with-yalies.sh deploy | rollback [checkpoint-directory]'; exit 1; }

# Deploy the working tree deliberately; do not commit, reset, merge, or change branches.
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  unset npm_config_prefix NPM_CONFIG_PREFIX
  export NVM_DIR="$HOME/.nvm"
  set +u
  source "$NVM_DIR/nvm.sh"
  nvm use 22
  set -u
fi
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Use Node 22 before deploying.' >&2; exit 1; }
for tool in gcloud firebase python3 npm jq; do command -v "$tool" >/dev/null; done

CHECKPOINT="$STATE/checkpoints/$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -p "$CHECKPOINT"
traffic yalies-backend > "$CHECKPOINT/backend-traffic"
traffic ssryalies > "$CHECKPOINT/frontend-traffic"
CHANNEL="before-oidc-$(date -u +%Y%m%d-%H%M%S)-$$"
(cd "$FRONTEND" && firebase hosting:channel:create "$CHANNEL" --expires 30d --project "$PROJECT")
(cd "$FRONTEND" && firebase hosting:clone yalies:live "yalies:$CHANNEL" --project "$PROJECT")
printf '%s\n' "$CHANNEL" > "$CHECKPOINT/frontend-channel"
printf '%s\n' "$CHECKPOINT" > "$STATE/last-checkpoint"
echo "Rollback checkpoint: $CHECKPOINT (Hosting backup retained for 30 days)."

PROXY_PID=''
cleanup() {
  if [[ -n "$PROXY_PID" ]]; then kill "$PROXY_PID" 2>/dev/null || true; wait "$PROXY_PID" 2>/dev/null || true; fi
  unset DATABASE_URL DEPLOYED_DATABASE_URL
}
trap cleanup EXIT

# Persist signing identity in Secret Manager; never regenerate deployed identities on retries.
gcloud services enable secretmanager.googleapis.com --project "$PROJECT"
export OIDC_PROVISION_DIR="$STATE/secrets"
node "$ROOT/scripts/oidc-local-secrets.mjs" "$OIDC_PROVISION_DIR"
RUNTIME_ACCOUNT="$(gcloud run services describe yalies-backend --project "$PROJECT" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
[[ -n "$RUNTIME_ACCOUNT" ]] || { echo 'Could not determine backend service account.' >&2; exit 1; }
for mapping in \
  'oidc-jwks.json:yalies-oidc-jwks' \
  'oidc-subject-secret:yalies-oidc-subject-secret' \
  'oidc-cookie-keys.json:yalies-oidc-cookie-keys' \
  'yuttler-client-secret:yalies-oidc-yuttler-client-secret'; do
  FILE="${mapping%%:*}"
  SECRET="${mapping#*:}"
  if gcloud secrets describe "$SECRET" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud secrets versions access latest --secret "$SECRET" --project "$PROJECT" > "$OIDC_PROVISION_DIR/$FILE.download"
    mv "$OIDC_PROVISION_DIR/$FILE.download" "$OIDC_PROVISION_DIR/$FILE"
  else
    gcloud secrets create "$SECRET" --replication-policy=automatic --data-file="$OIDC_PROVISION_DIR/$FILE" --project "$PROJECT"
  fi
  if [[ "$FILE" != yuttler-client-secret ]]; then
    gcloud secrets add-iam-policy-binding "$SECRET" --project "$PROJECT" --member="serviceAccount:$RUNTIME_ACCOUNT" --role=roles/secretmanager.secretAccessor >/dev/null
  fi
done
node "$ROOT/scripts/oidc-local-secrets.mjs" "$OIDC_PROVISION_DIR" render-env

# Follow this repo's existing Cloud SQL production workflow, without printing the connection string.
if [[ -z "${DATABASE_URL:-}" ]]; then
  command -v cloud-sql-proxy >/dev/null
  command -v lsof >/dev/null
  PROXY_PORT="${OIDC_PROXY_PORT:-1359}"
  INSTANCE="$(gcloud sql instances describe yalies-sql-prod --project "$PROJECT" --format='value(connectionName)')"
  [[ "$INSTANCE" == yalies:us-central1:yalies-sql-prod ]] || { echo 'Unexpected production SQL instance.' >&2; exit 1; }
  if lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PROXY_PORT is busy; set OIDC_PROXY_PORT to a free port." >&2; exit 1
  fi
  DEPLOYED_DATABASE_URL="$(gcloud run services describe yalies-backend --project "$PROJECT" --region "$REGION" --format=json | jq -er '.spec.template.spec.containers[].env[] | select(.name == "DATABASE_URL") | .value')"
  DATABASE_URL="$(printf '%s' "$DEPLOYED_DATABASE_URL" | OIDC_PROXY_PORT="$PROXY_PORT" node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{try {const u=new URL(s.trim());u.hostname="127.0.0.1";u.port=process.env.OIDC_PROXY_PORT;u.searchParams.delete("host");process.stdout.write(u.href)} catch {console.error("Invalid database connection configuration");process.exitCode=1}})')"
  export DATABASE_URL
  unset DEPLOYED_DATABASE_URL
  if [[ -s "$ROOT/.config/gcloud/service-key.json" ]]; then
    cloud-sql-proxy --port "$PROXY_PORT" --credentials-file "$ROOT/.config/gcloud/service-key.json" "$INSTANCE" > "$CHECKPOINT/sql-proxy.log" 2>&1 &
  else
    cloud-sql-proxy --port "$PROXY_PORT" "$INSTANCE" > "$CHECKPOINT/sql-proxy.log" 2>&1 &
  fi
  PROXY_PID=$!
  for ((attempt=0; attempt<30; attempt++)); do
    lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    kill -0 "$PROXY_PID" 2>/dev/null || { echo 'Cloud SQL proxy failed; inspect the checkpoint log.' >&2; exit 1; }
    sleep 1
  done
  lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 || { echo 'Cloud SQL proxy did not become ready.' >&2; exit 1; }
fi

(cd "$ROOT/Yalies/yalies-shared" && npm ci && npm run build)
(cd "$BACKEND" && npm ci && npm run build && node scripts/prepare-yuttler-production.mjs)
bash "$BACKEND/deploy.sh" \
  --update-env-vars='OIDC_ENABLED=true,OIDC_ISSUER=https://api.yalies.io,FRONTEND_URL=https://yalies.io,NODE_ENV=production' \
  --update-secrets='OIDC_JWKS=yalies-oidc-jwks:latest,OIDC_SUBJECT_SECRET=yalies-oidc-subject-secret:latest,OIDC_COOKIE_KEYS=yalies-oidc-cookie-keys:latest'
bash "$FRONTEND/deploy.sh"
echo "Yalies frontend/backend deployed. Import $STATE/yuttler-render.env into the existing Yuttler proxy's Render environment."
echo "Rollback: bash '$ROOT/scripts/continue-with-yalies.sh' rollback '$CHECKPOINT'"
