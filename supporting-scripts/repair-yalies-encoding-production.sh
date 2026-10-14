#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")" && pwd)"
REPO="$WORKSPACE/Yalies"
PIPELINE="$REPO/yalies-internal/yalies-data-pipeline"
FACEBOOK_JS="$PIPELINE/browser/facebook-export.js"
DIRECTORY_REPAIR_JS="$PIPELINE/browser/directory-encoding-repair.js"
SERVICE_KEY="$WORKSPACE/.config/gcloud/service-key.json"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-$HOME/Downloads}"
GCP_PROJECT="${GCP_PROJECT:-yalies}"
GCP_REGION="${GCP_REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-yalies-backend}"
PROD_INSTANCE_NAME="${PROD_INSTANCE_NAME:-yalies-sql-prod}"
PROXY_PORT="${PROXY_PORT:-1357}"
TODAY="$(date +%F)"
CORRUPT_FACEBOOK="${CORRUPT_FACEBOOK:-$DOWNLOADS_DIR/yalies-facebook-2026-09-13.json}"
CORRECTED_FACEBOOK=""
DIRECTORY_REPAIR=""
STARTED_PROXY=false

fail() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  echo "Usage: ./repair-yalies-encoding-production.sh [--corrupt-facebook FILE] [--corrected-facebook FILE] [--repair-directory FILE]"
}

cleanup() {
  unset DATABASE_URL DEPLOYED_DATABASE_URL
  if [[ "$STARTED_PROXY" == true ]] && [[ -n "${PROXY_PID:-}" ]]; then
    echo "Stopping the Cloud SQL proxy started by this script..."
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ask_yes() {
  local prompt="$1"
  local answer
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

choose_download() {
  local prefix="$1"
  local label="$2"
  local latest=""
  local entered=""
  latest="$(find "$DOWNLOADS_DIR" -maxdepth 1 -type f -name "${prefix}-${TODAY}*.json" -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null | head -n 1 || true)"
  if [[ -n "$latest" ]]; then
    echo "Newest $label: $latest" >&2
    read -r -p "Press Enter to use it, or paste/drag another JSON path: " entered
    entered="${entered:-$latest}"
  else
    read -r -p "Paste/drag the downloaded $label JSON path: " entered
  fi
  entered="${entered#\'}"; entered="${entered%\'}"
  entered="${entered#\"}"; entered="${entered%\"}"
  entered="${entered//\\ / }"
  [[ -f "$entered" ]] || fail "$label not found: $entered"
  printf '%s' "$entered"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --corrupt-facebook)
      [[ $# -ge 2 ]] || fail "--corrupt-facebook requires a path"
      CORRUPT_FACEBOOK="$2"
      shift 2
      ;;
    --corrected-facebook)
      [[ $# -ge 2 ]] || fail "--corrected-facebook requires a path"
      CORRECTED_FACEBOOK="$2"
      shift 2
      ;;
    --repair-directory)
      [[ $# -ge 2 ]] || fail "--repair-directory requires a path"
      DIRECTORY_REPAIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

for command_name in open pbcopy gcloud cloud-sql-proxy jq node npm psql lsof; do
  command -v "$command_name" >/dev/null || fail "$command_name is not installed"
done
[[ -f "$CORRUPT_FACEBOOK" ]] || fail "Original corrupt Face Book export not found: $CORRUPT_FACEBOOK"
[[ -z "$CORRECTED_FACEBOOK" || -f "$CORRECTED_FACEBOOK" ]] || fail "Corrected Face Book export not found: $CORRECTED_FACEBOOK"
[[ -z "$DIRECTORY_REPAIR" || -f "$DIRECTORY_REPAIR" ]] || fail "Directory repair export not found: $DIRECTORY_REPAIR"
[[ -f "$FACEBOOK_JS" ]] || fail "Missing $FACEBOOK_JS"
[[ -f "$DIRECTORY_REPAIR_JS" ]] || fail "Missing $DIRECTORY_REPAIR_JS"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" == "20" ]] || fail "The pipeline requires Node 20; found $(node --version). Run 'nvm use 20'."

echo "Yalies production encoding repair"
echo "This fixes only the live names from the 49-record Unicode incident."
echo "It also looks those students up in Yale Directory and fills authoritative"
echo "identity/email fields when a safe match is found."
echo
ask_yes "Continue with the guided production repair?" || exit 0

echo
echo "Step 1/4: Download a correctly decoded Face Book roster"
if [[ -n "$CORRECTED_FACEBOOK" ]]; then
  echo "Reusing: $CORRECTED_FACEBOOK"
else
  open "https://students.yale.edu/facebook/"
  echo "Sign in, select Yale in the organization dropdown, and open DevTools Console."
  if ask_yes "Copy the fixed Face Book exporter to your clipboard now?"; then
    pbcopy < "$FACEBOOK_JS"
    echo "Copied. Paste it into DevTools Console and press Enter."
  else
    fail "Repair cancelled"
  fi
  read -r -p "Press Enter after the corrected Face Book JSON downloads... "
  CORRECTED_FACEBOOK="$(choose_download "yalies-facebook" "corrected Face Book export")"
fi

echo
echo "Step 2/4: Look up only the 49 affected students in Yale Directory"
if [[ -n "$DIRECTORY_REPAIR" ]]; then
  echo "Reusing: $DIRECTORY_REPAIR"
else
  open "https://directory.yale.edu/"
  echo "Sign in and open DevTools Console. The repair collector will ask you to"
  echo "select these two files together:"
  echo "  Original:  $CORRUPT_FACEBOOK"
  echo "  Corrected: $CORRECTED_FACEBOOK"
  if ask_yes "Copy the quick Directory repair collector to your clipboard now?"; then
    pbcopy < "$DIRECTORY_REPAIR_JS"
    echo "Copied. Paste it into DevTools Console, press Enter, and select both files."
  else
    fail "Repair cancelled"
  fi
  read -r -p "Press Enter after the Directory repair JSON downloads... "
  DIRECTORY_REPAIR="$(choose_download "yalies-directory-encoding-repair" "Directory repair export")"
fi

echo
echo "Step 3/4: Connect to the verified production database"
CLOUD_SQL_PROD_INSTANCE="$(gcloud sql instances describe "$PROD_INSTANCE_NAME" \
  --project="$GCP_PROJECT" --format='value(connectionName)')"
EXPECTED_INSTANCE="$GCP_PROJECT:$GCP_REGION:$PROD_INSTANCE_NAME"
[[ "$CLOUD_SQL_PROD_INSTANCE" == "$EXPECTED_INSTANCE" ]] ||
  fail "Expected '$EXPECTED_INSTANCE', found '$CLOUD_SQL_PROD_INSTANCE'"

DEPLOYED_DATABASE_URL="$(gcloud run services describe "$BACKEND_SERVICE" \
  --project="$GCP_PROJECT" --region="$GCP_REGION" --format=json \
  | jq -er '.spec.template.spec.containers[].env[] | select(.name == "DATABASE_URL") | .value')" ||
  fail "Could not retrieve production DATABASE_URL"
DATABASE_URL="$(printf '%s' "$DEPLOYED_DATABASE_URL" | PROXY_PORT="$PROXY_PORT" node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const url = new URL(input.trim());
    url.hostname = "127.0.0.1";
    url.port = process.env.PROXY_PORT;
    process.stdout.write(url.toString());
  });
')"
unset DEPLOYED_DATABASE_URL
export DATABASE_URL

if lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  EXISTING_PROXY_PID="$(lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN -t | head -n 1)"
  EXISTING_PROXY_ARGS="$(ps -p "$EXISTING_PROXY_PID" -o args= 2>/dev/null || true)"
  [[ "$EXISTING_PROXY_ARGS" == *"$CLOUD_SQL_PROD_INSTANCE"* ]] || fail "Port $PROXY_PORT is not the production proxy"
  echo "Reusing verified production proxy on port $PROXY_PORT."
else
  if [[ -s "$SERVICE_KEY" ]]; then
    cloud-sql-proxy --port "$PROXY_PORT" "--credentials-file=$SERVICE_KEY" "$CLOUD_SQL_PROD_INSTANCE" &
  else
    gcloud auth application-default print-access-token >/dev/null 2>&1 ||
      fail "No service key or ADC. Run: gcloud auth application-default login"
    cloud-sql-proxy --port "$PROXY_PORT" "$CLOUD_SQL_PROD_INSTANCE" &
  fi
  PROXY_PID=$!
  STARTED_PROXY=true
  for _ in {1..30}; do
    lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    kill -0 "$PROXY_PID" 2>/dev/null || fail "Cloud SQL proxy exited before becoming ready"
    sleep 1
  done
  lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 || fail "Cloud SQL proxy did not become ready"
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT current_database() = 'postgres'" | grep -qx 't' ||
  fail "Production database identity check failed"

echo
echo "Step 4/4: Preview and apply the exact remaining-row repair"
cd "$PIPELINE"
PREVIEW_LOG="$(mktemp -t yalies-encoding-repair.XXXXXX)"
npm run repair-encoding -- \
  --corrupt-facebook "$CORRUPT_FACEBOOK" \
  --corrected-facebook "$CORRECTED_FACEBOOK" \
  --repair-directory "$DIRECTORY_REPAIR" \
  --target production 2>&1 | tee "$PREVIEW_LOG"
REPAIR_TOKEN="$(grep -Eo 'REPAIR-[A-F0-9]{12}' "$PREVIEW_LOG" | tail -n 1 || true)"
rm -f "$PREVIEW_LOG"
[[ -n "$REPAIR_TOKEN" ]] || fail "Preview did not produce a repair token"

echo
echo "Review the changes above. Applying creates a recovery table first."
echo "Expected confirmation token: $REPAIR_TOKEN"
read -r -p "Paste the exact token to apply, or press Enter to stop: " CONFIRM_TOKEN
if [[ -z "$CONFIRM_TOKEN" ]]; then
  echo "Stopped after preview. Production was not changed."
  exit 0
fi
[[ "$CONFIRM_TOKEN" == "$REPAIR_TOKEN" ]] || fail "Confirmation token did not match"

npm run repair-encoding -- \
  --corrupt-facebook "$CORRUPT_FACEBOOK" \
  --corrected-facebook "$CORRECTED_FACEBOOK" \
  --repair-directory "$DIRECTORY_REPAIR" \
  --apply --target production --confirm "$CONFIRM_TOKEN"

echo
echo "Production encoding repair complete. The recovery table is printed above."
