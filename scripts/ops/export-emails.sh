#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")/../.." && pwd)"
PROXY_ENV="$WORKSPACE/.config/.env.proxy"
DATABASE_ENV="$WORKSPACE/.config/internal/.env.data-pipeline"
SERVICE_KEY="$WORKSPACE/.config/gcloud/service-key.json"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-$HOME/Downloads}"
YEARS="${1:?Usage: export-emails.sh YEAR[,YEAR...] [OUTPUT] [selected-majors]}"
[[ "$YEARS" =~ ^[0-9]{4}(,[0-9]{4})*$ ]] || { echo "Use comma-separated four-digit years" >&2; exit 1; }
OUTPUT="${2:-$DOWNLOADS_DIR/yale-college-${YEARS//,/-}-emails.csv}"
FILTER="${3:-all}"
[[ "$FILTER" == all || "$FILTER" == selected-majors ]] || { echo "Filter must be all or selected-majors" >&2; exit 1; }
GCP_PROJECT="${GCP_PROJECT:-yalies}"
GCP_REGION="${GCP_REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-yalies-backend}"
PROD_INSTANCE_NAME="${PROD_INSTANCE_NAME:-yalies-sql-prod}"
PROXY_PORT="${PROXY_PORT:-1357}"
STARTED_PROXY=false

fail() { echo "ERROR: $*" >&2; exit 1; }

cleanup() {
  unset DATABASE_URL DEPLOYED_DATABASE_URL
  if [[ "$STARTED_PROXY" == true ]] && [[ -n "${PROXY_PID:-}" ]]; then
    echo "Stopping Cloud SQL proxy started by this script..."
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for command_name in gcloud cloud-sql-proxy jq node psql lsof; do
  command -v "$command_name" >/dev/null || fail "$command_name is not installed"
done

# Priority: existing environment, optional local files, then Google Cloud.
if [[ -f "$PROXY_ENV" ]]; then
  original_dev_mode="${DEV_MODE-}"
  original_prod_instance="${CLOUD_SQL_PROD_INSTANCE-}"
  set -a
  # shellcheck disable=SC1090
  source "$PROXY_ENV"
  set +a
  [[ -z "$original_dev_mode" ]] || DEV_MODE="$original_dev_mode"
  [[ -z "$original_prod_instance" ]] || CLOUD_SQL_PROD_INSTANCE="$original_prod_instance"
fi

DEV_MODE="${DEV_MODE:-production}"
[[ "$DEV_MODE" == "production" ]] ||
  fail "Refusing to run: DEV_MODE must be 'production'; found '$DEV_MODE'"

if [[ -z "${CLOUD_SQL_PROD_INSTANCE:-}" ]]; then
  echo "Discovering the production Cloud SQL instance..."
  CLOUD_SQL_PROD_INSTANCE="$(gcloud sql instances describe "$PROD_INSTANCE_NAME" \
    --project="$GCP_PROJECT" --format='value(connectionName)')"
fi

EXPECTED_INSTANCE="$GCP_PROJECT:$GCP_REGION:$PROD_INSTANCE_NAME"
[[ "$CLOUD_SQL_PROD_INSTANCE" == "$EXPECTED_INSTANCE" ]] ||
  fail "Expected '$EXPECTED_INSTANCE', found '$CLOUD_SQL_PROD_INSTANCE'"
echo "Verified production instance: $CLOUD_SQL_PROD_INSTANCE"

if [[ -z "${DATABASE_URL:-}" ]] && [[ -f "$DATABASE_ENV" ]]; then
  original_database_url="${DATABASE_URL-}"
  set -a
  # shellcheck disable=SC1090
  source "$DATABASE_ENV"
  set +a
  [[ -z "$original_database_url" ]] || DATABASE_URL="$original_database_url"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Retrieving DATABASE_URL from the deployed backend configuration..."
  DEPLOYED_DATABASE_URL="$(gcloud run services describe "$BACKEND_SERVICE" \
    --project="$GCP_PROJECT" --region="$GCP_REGION" --format=json \
    | jq -er '.spec.template.spec.containers[].env[] | select(.name == "DATABASE_URL") | .value')" \
    || fail "Could not retrieve DATABASE_URL from Cloud Run"

  # Keep credentials in memory and route through the local proxy.
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
fi

[[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL could not be resolved"

# Verify a caller/local URL also routes to the expected proxy and database.
DATABASE_TARGET="$(printf '%s' "$DATABASE_URL" | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const url = new URL(input.trim());
    process.stdout.write(`${url.hostname}:${url.port}/${url.pathname.replace(/^\//, "")}`);
  });
')"
[[ "$DATABASE_TARGET" == "127.0.0.1:$PROXY_PORT/postgres" ||
   "$DATABASE_TARGET" == "localhost:$PROXY_PORT/postgres" ]] ||
  fail "Refusing unexpected database target '$DATABASE_TARGET'"
unset DATABASE_TARGET

if lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  EXISTING_PROXY_PID="$(lsof -n -P -iTCP:"$PROXY_PORT" -sTCP:LISTEN -t | head -n 1)"
  EXISTING_PROXY_ARGS="$(ps -p "$EXISTING_PROXY_PID" -o args= 2>/dev/null || true)"
  [[ "$EXISTING_PROXY_ARGS" == *"$CLOUD_SQL_PROD_INSTANCE"* ]] ||
    fail "Port $PROXY_PORT is not verified as the production proxy"
  echo "Reusing the verified production proxy on port $PROXY_PORT."
else
  if [[ -s "$SERVICE_KEY" ]]; then
    echo "Starting production Cloud SQL proxy with the configured service key..."
    cloud-sql-proxy --port "$PROXY_PORT" \
      "--credentials-file=$SERVICE_KEY" \
      "$CLOUD_SQL_PROD_INSTANCE" &
  else
    gcloud auth application-default print-access-token >/dev/null 2>&1 ||
      fail "No service key or ADC. Run: gcloud auth application-default login"
    echo "Starting production Cloud SQL proxy with Application Default Credentials..."
    cloud-sql-proxy --port "$PROXY_PORT" \
      "$CLOUD_SQL_PROD_INSTANCE" &
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

echo "Testing the production database connection..."
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT current_database() = 'postgres'" | grep -qx 't' ||
  fail "Connected database identity check failed"

echo "Exporting Yale College years $YEARS ($FILTER)..."
umask 077
mkdir -p "$(dirname "$OUTPUT")"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --csv -P footer=off -c "
  SELECT
    CONCAT_WS(' ', COALESCE(NULLIF(BTRIM(preferred_name), ''), first_name), last_name) AS name,
    email,
    major
  FROM person
  WHERE year IN ($YEARS)
    AND (school = 'Yale College' OR school_code = 'YC')
    -- Screenshot majors mapped to exact values in allowedMajors.ts.
    -- Include the intensive variants of Chemistry and Mathematics.
    AND ('$FILTER' = 'all' OR major IN (
      'Applied Mathematics',
      'Chemical Engineering',
      'Chemistry',
      'Chemistry (Int.)',
      'Cognitive Science',
      'Computer Science',
      'Computer Science & Econ',
      'Computer Science & Mathematics',
      'Computer Science & Psychology',
      'Computing & Linguistics',
      'Computing and the Arts',
      'Economics & Mathematics',
      'Electrical Engineering',
      'Elec Engineering & Comp Sci',
      'English',
      'Mathematics',
      'Mathematics (Int.)',
      'Mechanical Engineering',
      'Molecular Biophysics & Biochem',
      'Neuroscience',
      'Statistics and Data Science'
    ))
    AND email IS NOT NULL
    AND BTRIM(email) <> ''
  ORDER BY last_name, first_name;
" > "$OUTPUT"

chmod 600 "$OUTPUT"
ROW_COUNT="$(($(wc -l < "$OUTPUT") - 1))"
echo "Exported $ROW_COUNT records to:"
echo "$OUTPUT"
