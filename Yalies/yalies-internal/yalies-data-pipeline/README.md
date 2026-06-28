# Yalies Data Pipeline

Scrapes the Yale Face Book + Directory, enriches/validates the data and photos,
and syncs it into the production `person` table and the `yalies-photos` GCS
bucket. Also serves the API the internal dashboard drives.

See [../README.md](../README.md) for the full architecture, the local runbook
(proxy → pipeline → dashboard), the required `.config` env files, and how it
couples to the public site.

## CLI (run from this directory)

Requires Node 20 (`nvm use`), `npm install`, and `../../../.config/internal/.env.data-pipeline`
(`DATABASE_URL`, etc.). The DB must be reachable — locally via the Cloud SQL proxy (`../../start-proxy.sh`).

- `npm run server` — start the dashboard API on :8080
- `npm start -- all --facebook-cookie <c> --directory-cookie <c>` — full pipeline (scrape → enrich → load → validate)
- `npm start -- <facebook|photos|directory|load|validate>` — run a single stage (`--dry-run` to preview a load, `--force` to skip safety guards)
- `npm run add-admin -- <netid>` — grant a netid access to the dashboard (required to bootstrap the first admin)
- `npm run qc` / `npm run qc:fix` — data quality checks
- `npm run enrich-missing -- --cookie <c>` — backfill netids for rows missing them

Cookies are copied by hand from DevTools after logging into students.yale.edu/facebook
and directory.yale.edu.

## Python tools (optional)

`npm run enhance` / `npm run facecheck` run the Python image tooling via `python/venv/bin/python`.
Build the venv first: `cd python && python3.11 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`.
