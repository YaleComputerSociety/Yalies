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

## Local scripts

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
