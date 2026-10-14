#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")" && pwd)"
REPO="$WORKSPACE/Yalies"
PIPELINE="$REPO/yalies-internal/yalies-data-pipeline"
FACEBOOK_JS="$PIPELINE/browser/facebook-export.js"
DIRECTORY_JS="$PIPELINE/browser/directory-export.js"
SERVICE_KEY="$WORKSPACE/.config/gcloud/service-key.json"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-$HOME/Downloads}"
GCP_PROJECT="${GCP_PROJECT:-yalies}"
GCP_REGION="${GCP_REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-yalies-backend}"
PROD_INSTANCE_NAME="${PROD_INSTANCE_NAME:-yalies-sql-prod}"
PROXY_PORT="${PROXY_PORT:-1357}"
TODAY="$(date +%F)"
STARTED_PROXY=false
FACEBOOK_FILE=""
DIRECTORY_FILE=""

fail() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  ./sync-yalies-production.sh
  ./sync-yalies-production.sh --facebook-file FILE [--directory-file FILE]

Checkpoint options:
  --facebook-file FILE   Reuse an existing Face Book browser export.
  --directory-file FILE  Reuse an existing Directory browser export and start
                         at Step 3. Requires --facebook-file.
  -h, --help             Show this help.

Supplying both files skips the browser export stages. The files are still fully
validated before any database connection or change.
EOF
}

cleanup() {
  unset DATABASE_URL DEPLOYED_DATABASE_URL COOKIE_INPUT COOKIE_VALUE
  if [[ -n "${COOKIE_FILE:-}" ]] && [[ -f "$COOKIE_FILE" ]]; then
    rm -f "$COOKIE_FILE"
  fi
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

  latest="$(find "$DOWNLOADS_DIR" -maxdepth 1 -type f \
    -name "${prefix}-${TODAY}*.json" -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null | head -n 1 || true)"

  if [[ -n "$latest" ]]; then
    echo "Newest $label export: $latest" >&2
    read -r -p "Press Enter to use it, or paste/drag another JSON path: " entered
    entered="${entered:-$latest}"
  else
    read -r -p "Paste or drag the downloaded $label JSON path here: " entered
  fi

  # Terminal drag-and-drop may add quoting or backslash-escaped spaces.
  entered="${entered#\'}"; entered="${entered%\'}"
  entered="${entered#\"}"; entered="${entered%\"}"
  entered="${entered//\\ / }"
  [[ -f "$entered" ]] || fail "$label export not found: $entered"
  printf '%s' "$entered"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --facebook-file)
      [[ $# -ge 2 ]] || fail "--facebook-file requires a path"
      FACEBOOK_FILE="$2"
      shift 2
      ;;
    --directory-file)
      [[ $# -ge 2 ]] || fail "--directory-file requires a path"
      DIRECTORY_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1 (use --help)"
      ;;
  esac
done

[[ -z "$DIRECTORY_FILE" || -n "$FACEBOOK_FILE" ]] ||
  fail "--directory-file requires --facebook-file"
[[ -z "$FACEBOOK_FILE" || -f "$FACEBOOK_FILE" ]] ||
  fail "Face Book export not found: $FACEBOOK_FILE"
[[ -z "$DIRECTORY_FILE" || -f "$DIRECTORY_FILE" ]] ||
  fail "Directory export not found: $DIRECTORY_FILE"

for command_name in open pbcopy pbpaste gcloud cloud-sql-proxy jq node npm psql lsof; do
  command -v "$command_name" >/dev/null || fail "$command_name is not installed"
done
[[ -f "$FACEBOOK_JS" ]] || fail "Missing $FACEBOOK_JS"
[[ -f "$DIRECTORY_JS" ]] || fail "Missing $DIRECTORY_JS"
[[ -f "$PIPELINE/package.json" ]] || fail "Missing data-pipeline package.json"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" == "20" ]] ||
  fail "The data pipeline requires Node 20; found $(node --version). Run 'nvm use 20'."

echo "Yalies production roster sync"
echo "This replaces all Yale College rows only after browser exports validate,"
echo "a database preview succeeds, and you enter its exact APPLY token."
echo
ask_yes "Continue with the production workflow?" || exit 0

if [[ ! -x "$PIPELINE/node_modules/.bin/tsc" ]]; then
  echo "Project dependencies are missing. Installing the locked dependency set..."
  (cd "$PIPELINE" && npm ci)
fi

echo "Discovering and verifying the production Cloud SQL instance..."
CLOUD_SQL_PROD_INSTANCE="$(gcloud sql instances describe "$PROD_INSTANCE_NAME" \
  --project="$GCP_PROJECT" --format='value(connectionName)')"
EXPECTED_INSTANCE="$GCP_PROJECT:$GCP_REGION:$PROD_INSTANCE_NAME"
[[ "$CLOUD_SQL_PROD_INSTANCE" == "$EXPECTED_INSTANCE" ]] ||
  fail "Expected '$EXPECTED_INSTANCE', found '$CLOUD_SQL_PROD_INSTANCE'"
export DEV_MODE=production
echo "Verified: $CLOUD_SQL_PROD_INSTANCE"

echo
echo "Step 1/5: Yale Face Book export"
if [[ -n "$FACEBOOK_FILE" ]]; then
  echo "Checkpoint supplied; skipping browser export."
  echo "Using: $FACEBOOK_FILE"
else
  open "https://students.yale.edu/facebook/"
  echo "Sign in, select Yale in the organization dropdown, and open DevTools Console."
  if ask_yes "Copy the vetted Face Book exporter to your clipboard now?"; then
    pbcopy < "$FACEBOOK_JS"
    echo "Copied. Paste it into the Console and press Enter. It will download a JSON file."
  else
    fail "Face Book export cancelled"
  fi
  read -r -p "Press Enter after the Face Book JSON finishes downloading... "
  FACEBOOK_FILE="$(choose_download "yalies-facebook" "Face Book")"
  echo "Using: $FACEBOOK_FILE"
fi

echo
echo "Step 2/5: Yale Directory enrichment"
if [[ -n "$DIRECTORY_FILE" ]]; then
  echo "Checkpoint supplied; skipping browser enrichment."
  echo "Using: $DIRECTORY_FILE"
else
  open "https://directory.yale.edu/"
  echo "Sign in and open DevTools Console. The exporter will ask you to select:"
  echo "  $FACEBOOK_FILE"
  echo "The Directory pass can take roughly 30–60 minutes. Keep that tab open."
  if ask_yes "Copy the vetted Directory exporter to your clipboard now?"; then
    pbcopy < "$DIRECTORY_JS"
    echo "Copied. Paste it into the Console, press Enter, and select the Face Book JSON."
    echo "If interrupted, rerun it with the same Face Book JSON to resume its checkpoint."
  else
    fail "Directory export cancelled"
  fi
  read -r -p "Press Enter after the Directory JSON finishes downloading... "
  DIRECTORY_FILE="$(choose_download "yalies-directory" "Directory")"
  echo "Using: $DIRECTORY_FILE"
fi

echo
echo "Step 3/5: Merge and validate both browser exports"
cd "$PIPELINE"
npm start -- browser-import \
  --facebook-file "$FACEBOOK_FILE" \
  --directory-file "$DIRECTORY_FILE"

echo
echo "Step 4/5: Resolve production credentials and start the verified proxy"
DEPLOYED_DATABASE_URL="$(gcloud run services describe "$BACKEND_SERVICE" \
  --project="$GCP_PROJECT" --region="$GCP_REGION" --format=json \
  | jq -er '.spec.template.spec.containers[].env[] | select(.name == "DATABASE_URL") | .value')" \
  || fail "Could not retrieve DATABASE_URL from Cloud Run"
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
  [[ "$EXISTING_PROXY_ARGS" == *"$CLOUD_SQL_PROD_INSTANCE"* ]] ||
    fail "Port $PROXY_PORT is not verified as the production proxy"
  echo "Reusing the verified production proxy on port $PROXY_PORT."
else
  if [[ -s "$SERVICE_KEY" ]]; then
    cloud-sql-proxy --port "$PROXY_PORT" "--credentials-file=$SERVICE_KEY" \
      "$CLOUD_SQL_PROD_INSTANCE" &
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
  lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 ||
    fail "Cloud SQL proxy did not become ready"
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT current_database() = 'postgres'" | grep -qx 't' ||
  fail "Production database identity check failed"

echo
echo "Step 5/5: Preview the exact production replacement plan"
PREVIEW_LOG="$(mktemp -t yalies-load-preview.XXXXXX)"
npm start -- load 2>&1 | tee "$PREVIEW_LOG"
PLAN_TOKEN="$(grep -Eo 'APPLY-[A-F0-9]{12}' "$PREVIEW_LOG" | tail -n 1 || true)"
rm -f "$PREVIEW_LOG"
[[ -n "$PLAN_TOKEN" ]] || fail "The preview did not produce an APPLY token"

echo
echo "Review the preview above carefully. Applying it replaces all Yale College"
echo "rows transactionally and creates a recovery table first."
echo "Expected confirmation token: $PLAN_TOKEN"
read -r -p "Paste the exact APPLY token to perform the production sync, or press Enter to stop: " CONFIRM_TOKEN
if [[ -z "$CONFIRM_TOKEN" ]]; then
  echo "Stopped after preview. The production database was not changed."
  exit 0
fi
[[ "$CONFIRM_TOKEN" == "$PLAN_TOKEN" ]] || fail "Confirmation token did not match"

npm start -- load --apply --target production --confirm "$CONFIRM_TOKEN"
echo
echo "Production database sync completed. Review the printed validation summary"
echo "and save the recovery table name through the recovery window."

echo
echo "Optional photo sync/repair"
echo "This checks existing gs://yalies-photos objects, replaces corrupt objects,"
echo "and uploads only missing photos. It does not reload the database."
if ! ask_yes "Run the photo sync now?"; then
  echo "Skipped photo sync. You can rerun this workflow or use PHOTO_RUNBOOK.md later."
  exit 0
fi

PHOTO_ID="$(jq -er 'first(.students[].photo_id | select(. != "" and . != "0"))' \
  "$FACEBOOK_FILE")" || fail "No usable photo ID in the Face Book export"
PHOTO_URL="https://students.yale.edu/facebook/Photo?id=$PHOTO_ID"
open "$PHOTO_URL"
echo "A real Face Book photo URL has opened. Capture its proven-good session:"
echo "  1. Open DevTools -> Network, then reload the photo tab if needed."
echo "  2. Select the request whose name begins with Photo?id=."
echo "  3. Confirm Status is 200, Content-Type is image/*, and Preview is a portrait."
echo "  4. Right-click that exact request -> Copy -> Copy as cURL."
echo
echo "Copy as cURL is preferred. The parser also accepts Copy request headers or"
echo "the complete Cookie request-header value (all name=value pairs), but not a"
echo "single guessed JSESSIONID. Do not paste this short-lived credential into chat."
read -r -p "Press Enter after the copied request or Cookie is on your clipboard... "

while true; do
  COOKIE_INPUT="$(pbpaste)"
  if COOKIE_VALUE="$(printf '%s' "$COOKIE_INPUT" | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    input = input.trim();
    const normalized = input.replace(/\\\r?\n/g, " ");
    const patterns = [
      /(?:^|\s)(?:-b|--cookie)(?:\s+|=)\s*\$?(["\x27])(.*?)\1/is,
      /(?:-H|--header)(?:\s+|=)\s*\$?(["\x27])Cookie:\s*(.*?)\1/is
    ];
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[2]) {
        process.stdout.write(match[2]);
        return;
      }
    }

    // DevTools "Copy request headers" form.
    const header = normalized.match(/(?:^|\r?\n)Cookie:\s*([^\r\n]+)/i);
    if (header?.[1]) {
      process.stdout.write(header[1].trim());
      return;
    }

    // A deliberately copied raw Cookie value. Require cookie-pair structure so
    // unrelated clipboard text containing an equals sign is not accepted.
    const raw = normalized.replace(/^Cookie:\s*/i, "").trim();
    if (!/^curl\s/i.test(raw) && /^[^=;\s]+=[^;\r\n]*(?:;\s*[^=;\s]+=[^;\r\n]*)*$/.test(raw)) {
      process.stdout.write(raw);
      return;
    }
    process.exitCode = 1;
  });
')" && [[ -n "$COOKIE_VALUE" ]]; then
    unset COOKIE_INPUT
    break
  fi

  unset COOKIE_INPUT COOKIE_VALUE
  echo "Could not extract a complete Cookie from the clipboard." >&2
  echo "Copy the successful Photo?id= request as cURL, request headers, or its full Cookie value." >&2
  ask_yes "Try copying it again?" || {
    echo "Photo sync skipped; the completed database sync is unchanged."
    exit 0
  }
  read -r -p "Press Enter after replacing the clipboard contents... "
done

COOKIE_FILE="$(mktemp -t yalies-facebook-cookie.XXXXXX)"
chmod 600 "$COOKIE_FILE"
printf '%s' "$COOKIE_VALUE" > "$COOKIE_FILE"
unset COOKIE_VALUE

if [[ -s "$SERVICE_KEY" ]]; then
  export GOOGLE_APPLICATION_CREDENTIALS="$SERVICE_KEY"
else
  gcloud auth application-default print-access-token >/dev/null 2>&1 ||
    fail "Photo upload needs ADC. Run: gcloud auth application-default login"
fi

echo "Running idempotent photo sync/repair..."
npm start -- photos --facebook-cookie-file "$COOKIE_FILE"

if ask_yes "Run an immediate clean verification pass (expected: 0 uploads)?"; then
  npm start -- photos --facebook-cookie-file "$COOKIE_FILE"
fi

echo
echo "Roster, Directory fields, and photo sync are complete."
