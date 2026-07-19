# Yalies

This branch (`yalies-v3-prod`) uses the code under `Yalies/`. Ignore the old root-level `yalies-web/` and `yalies-backend/` directories from the `main` branch layout.

## Structure

- `yalies-external/yalies-web`
  - Public Next.js frontend
  - Deployed to Firebase Hosting
- `yalies-external/yalies-backend`
  - Public Express API
  - Deployed to Google Cloud Run as `yalies-backend`
- `yalies-internal/yalies-dashboard`
  - Internal dashboard
- `yalies-internal/yalies-data-pipeline`
  - Internal scrape/sync server
- `yalies-shared`
  - Shared types, endpoint constants, and utilities

## Local development and testing

### Run the public app locally

The easiest way to test frontend and backend changes together is to use the
launcher scripts from two terminals. The scripts select the package's Node
version, install dependencies, and load the local environment configuration.
The backend launcher also installs Node 22 if needed and builds
`yalies-shared` before compiling the API.

Terminal 1 — start the API and Cloud SQL Auth Proxy:

```bash
cd Yalies
./start-backend.sh
```

Keep this terminal running. The backend is ready when the output includes:

```text
The proxy has started successfully and is ready for new connections!
App running on port 8082
Connected to the database
```

Use this launcher instead of running the backend's `npm run dev` by itself;
the launcher also starts and waits for the database proxy.

Terminal 2 — start the Next.js frontend:

```bash
cd Yalies
./start-frontend.sh
```

Keep this terminal running too, then open
[http://localhost:3000](http://localhost:3000) in a browser. Click **Log in** to
use the development login configured by `DEV_NETID` in
`.config/external/.env.backend.development`.

Useful local checks:

```bash
# Public API
curl http://localhost:8082/v3/ping
```

After logging in through the browser, visit
[http://localhost:8082/v3/admin/facecheck](http://localhost:8082/v3/admin/facecheck)
to verify admin access. The logged-in `DEV_NETID` must also be included in the
comma-separated `ADMIN_NETIDS` value in the backend development env file.

Stop either development server with `Ctrl+C`.

If dependencies and environment files are already set up, you can run the npm
development commands directly:

```bash
# Frontend
cd Yalies/yalies-external/yalies-web
nvm use
npm install
npm run dev
```

```bash
# Backend (requires the proxy and backend environment to be loaded separately)
cd Yalies/yalies-external/yalies-backend
nvm install v22
nvm use

cd ../../yalies-shared
npm install
npm run build

cd ../yalies-external/yalies-backend
npm install
npm run dev
```

The backend `dev` command compiles and starts the server, but does not watch for
file changes. Restart it after editing backend code.

### Run local checks

There is currently no automated `npm test` script. Before opening a PR, run the
available checks in each package you changed:

```bash
# Public frontend
cd Yalies/yalies-external/yalies-web
npm run lint
npm run build
```

```bash
# Public backend
cd Yalies/yalies-external/yalies-backend
npm run lint
npm run build
```

After both development servers are running, verify the UI at
[http://localhost:3000](http://localhost:3000) and exercise the API routes used
by your change.

### Other local scripts

From `Yalies/`:

- `./start-proxy.sh`
  - Starts Cloud SQL Auth Proxy using `.config/.env.proxy`
- `./start-backend.sh`
  - Starts the proxy if needed, installs deps, runs the external backend
- `./start-frontend.sh`
  - Copies frontend env, installs deps, runs the external frontend
- `./start-dashboard.sh`
  - Copies dashboard env, installs deps, runs the dashboard
- `./start-data-pipeline.sh`
  - Builds `yalies-shared`, installs deps, runs the pipeline server

## Env files

Local development:
- `.config/.env.proxy`
- `.config/external/.env.web`
- `.config/external/.env.backend.development`
- `.config/internal/.env.dashboard`

Frontend production:
- `yalies-external/yalies-web/.env.production`

Use:

```bash
NEXT_PUBLIC_YALIES_API_URL=https://api.yalies.io
```

Backend production env vars are set in Cloud Run, not in a repo `.env.production`.

Important backend values:
- `FRONTEND_URL=https://yalies.io`
- `AUTH_MODE=cas`

## Node versions

Use `nvm use` inside each package.

Important ones:
- `yalies-external/yalies-web`: `v20.13.0`
- `yalies-external/yalies-backend`: `v22`

## Deploy

Deploy backend first, then frontend.

### Backend

```bash
cd Yalies/yalies-external/yalies-backend
source ~/.nvm/nvm.sh
nvm use 22
npm run deploy
```

### Frontend

```bash
cd Yalies/yalies-external/yalies-web
source ~/.nvm/nvm.sh
nvm use 20.13.0
npm run deploy
```

## Useful checks

```bash
curl -i https://api.yalies.io/v3/ping
```

```bash
gcloud run services describe yalies-backend --region us-central1
```

## Notes

- This branch uses `/v3/*` API routes.
- Login/search issues often come from mismatches between `NEXT_PUBLIC_YALIES_API_URL`, `FRONTEND_URL`, and the deployed backend version.
