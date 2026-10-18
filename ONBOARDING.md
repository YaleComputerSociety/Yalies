# Onboarding

Run commands from the repository root unless a step says otherwise.

## Install

Install Git and nvm, then:

```sh
nvm install
nvm use
npm ci
```

`npm ci` installs all workspaces and builds `yalies-shared`. Do not install dependencies separately in each app. Python is not required for web development.

## Configure

Get the development config bundle from a maintainer. Keep its filenames below. Templates in `config/examples` document the values; replace all placeholders before starting an app.

```sh
mkdir -p .config/external .config/internal
cp -n config/examples/.env.proxy .config/.env.proxy
cp -n config/examples/external/.env.* .config/external/
cp -n config/examples/internal/.env.* .config/internal/
```

| Local file | Required settings |
| --- | --- |
| `.config/.env.proxy` | `DEV_MODE=development`, `CLOUD_SQL_DEV_INSTANCE`; production instance is for operations only |
| `.config/external/.env.web` | `NEXT_PUBLIC_YALIES_API_URL=http://localhost:1337` |
| `.config/external/.env.backend.development` | `DATABASE_URL`, `SESSION_SECRET`, `PORT=1337`, `NODE_ENV=development`, `AUTH_MODE`, `DEV_NETID`, `FRONTEND_URL`, `ADMIN_NETIDS` |
| `.config/internal/.env.dashboard` | `NEXT_PUBLIC_SCRAPER_API_URL`, `NEXT_PUBLIC_BACKEND_API_URL` |
| `.config/internal/.env.data-pipeline` | `DATABASE_URL`, `SESSION_SECRET`, `AUTH_MODE`, `DASHBOARD_URL`, `NODE_ENV`; `DEV_NETID` for dev auth, optional `PORT=8080` |
| `.config/gcloud/service-key.json` | Optional private credential; use application-default credentials otherwise |

Use different random session secrets for the API and pipeline. Both connect to the development database. `AUTH_MODE=dev` bypasses CAS locally; never use it in production.

## Public app

For Cloud SQL development, install the Google Cloud CLI and Cloud SQL Auth Proxy. Authenticate with `gcloud auth application-default login` or obtain the private service key. A database must already have the application schema and development data; starting the proxy does not create them.

```sh
npm run doctor -- --cloud
bash scripts/dev/start-proxy.sh
```

Leave the proxy running. Start each app in its own terminal:

```sh
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. The API listens at `http://localhost:1337`; `/v3/ping` is its health route. Launchers build and watch shared code. Restart API/pipeline after server source changes. Web/dashboard use Next.js reloads.

The launchers do not start a database proxy automatically. This keeps database selection explicit. If using your own local PostgreSQL database, configure its URL and skip the proxy.

## Dashboard and pipeline

```sh
npm run doctor -- --all
npm run add-admin -w yalies-data-pipeline -- YOUR_NETID
npm run dev:pipeline
# In another terminal:
npm run dev:dashboard
```

Admin bootstrap writes to the configured database. Verify the development target first. Open `http://localhost:3001`; pipeline health is `http://localhost:8080/health`. The dashboard’s CAS flow is a known branch issue and was not exercised during this refactor.

## Checks

```sh
npm run check
NEXT_PUBLIC_YALIES_API_URL=http://localhost:1337 npm run build
```

Checks do not start the application or contact the configured database. Database integration tests are separate: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Optional tools

- OIDC: [authentication](docs/authentication.md) and [integration reference](docs/continue-with-yalies.md).
- Data refresh: [runbook](docs/operations/data-refresh.md).
- Photos: [runbook](docs/operations/photos.md). Create a Python environment under `apps/pipeline/python/venv`; install the relevant requirements and model files before enabling face-check. This environment was not validated by the workspace refactor.
- Operations/deployment: Google Cloud CLI, Firebase CLI, `jq`, Python 3, PostgreSQL CLI tools, and Cloud SQL Auth Proxy as required by the chosen script. See [deployment](docs/deployment.md).
