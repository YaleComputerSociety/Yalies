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
- `npm start -- all --facebook-cookie-file <path> --directory-cookie <c>` — cookie-based scrape and enrichment followed by a database **preview**
- `npm start -- <facebook|photos|directory|load|validate>` — run a single stage
- `npm start -- browser-import --facebook-file <json> --directory-file <json>` — merge and validate the two browser downloads
- `npm run add-admin -- <netid>` — grant a netid access to the dashboard (required to bootstrap the first admin)
- `npm run qc` / `npm run qc:fix` — data quality checks
- `npm run enrich-missing -- --cookie <c>` — backfill netids for rows missing them

Cookies are copied by hand from DevTools after logging into students.yale.edu/facebook
and directory.yale.edu. For Face Book, capture the complete Cookie header from
an exact successful request; an arbitrary bare `JSESSIONID` may belong to the
wrong Yale app or cookie path.

## Recommended browser-export workflow

The paste-in-console scripts live in [`browser/`](browser/):

- [`browser/facebook-export.js`](browser/facebook-export.js) runs on
  `students.yale.edu/facebook`. It downloads normalized student JSON and refuses
  a roster below 5,000 people, below 14 colleges, or with missing names.
- [`browser/directory-export.js`](browser/directory-export.js) runs on
  `directory.yale.edu`. It asks for the Facebook JSON, queries the Directory,
  and downloads a matching Directory JSON. It checkpoints every 25 students in
  IndexedDB and resumes when rerun with the same Facebook file. It can also
  repair an existing Directory JSON by selecting both files together in its
  initial multi-file chooser and querying only missing/error entries.

After both files download:

```bash
cd yalies-internal/yalies-data-pipeline
nvm use
npm start -- browser-import \
  --facebook-file ~/Downloads/yalies-facebook-YYYY-MM-DD.json \
  --directory-file ~/Downloads/yalies-directory-YYYY-MM-DD.json
```

This verifies both versioned schemas and their shared SHA-256 fingerprint,
merges records using Yale College/name/year/college scoring, writes
`output/students.json` and `output/students_enriched.json`, and runs all roster
and enrichment validations. Exports over 14 days old are rejected. It never
touches the database.

### Database preview and apply

Start the Cloud SQL proxy from the repository root first. Confirm
`.config/.env.proxy` has the intended `DEV_MODE`; `--apply` refuses a conflicting
`--target` label.

Every load is a preview unless `--apply` is present:

```bash
npm start -- load
```

The preview prints the resolved PostgreSQL user/host/database, existing and new
counts, and an `APPLY-...` token bound to that exact database, roster, and row
count. Review all of it. Then apply the unchanged plan:

```bash
npm start -- load --apply --target production --confirm APPLY-XXXXXXXXXXXX
```

Before deleting anything, the transaction creates a Postgres table named like
`person_backup_yc_20260801...`. The backup, delete, and replacement commit
atomically. Post-load database validation runs immediately. Never use `--force`
unless the roster difference has been independently explained; it bypasses the
80% replacement-size guard, but not validation or the plan token.

If post-load review requires restoring the snapshot, connect with `psql` and use
the exact recovery table printed by the apply command:

```sql
BEGIN;
DELETE FROM person WHERE school = 'Yale College' OR school_code = 'YC';
INSERT INTO person SELECT * FROM person_backup_yc_REPLACE_WITH_PRINTED_NAME;
COMMIT;
```

Run database validation again after a restore. Keep the backup table through the
recovery window; dropping it is a separate, deliberate operator action.

The JSON exports contain confidential Yale data. They and `output/` are
gitignored; delete downloaded copies after validation and any recovery window.

The JSON workflow updates the `person` table and records photo URLs, but it does
not copy image bytes into GCS. Run the separate authenticated photo stage after
each roster refresh. It byte-validates existing objects, repairs corrupt files,
uploads missing photos, and supports a clean zero-change verification pass.

Follow [`PHOTO_RUNBOOK.md`](PHOTO_RUNBOOK.md) exactly. In particular, copy the
complete Cookie value from a verified successful
`https://students.yale.edu/facebook/Photo?id=XXXXXX` browser request and prefer
the private-file form:

```bash
npm start -- photos \
  --facebook-cookie-file /tmp/yalies-facebook-cookie.txt
```

Do not reload the database or redeploy the public apps after this command; the
existing `person.image` URLs already address the GCS objects.

## Python tools (optional)

`npm run enhance` / `npm run facecheck` run the Python image tooling via `python/venv/bin/python`.
Build the venv first: `cd python && python3.11 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`.
