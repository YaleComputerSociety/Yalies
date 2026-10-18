# Yalies Data Pipeline

Scrapes the Yale Face Book + Directory, enriches/validates the data and photos,
and syncs it into the production `person` table and the `yalies-photos` GCS
bucket. Also serves the API the internal dashboard drives.

Setup: [onboarding](../../ONBOARDING.md).

## CLI (run from `apps/pipeline`)

Requires Node 22 (`nvm install && nvm use`), root `npm ci`, and `../../.config/internal/.env.data-pipeline`
(`DATABASE_URL`, etc.). The DB must be reachable — locally via the Cloud SQL proxy (`bash scripts/dev/start-proxy.sh`).

- `npm run server` — start the dashboard API on :8080
- `npm start -- all --facebook-cookie-file <path> --directory-cookie <c>` — cookie-based scrape and enrichment followed by a database **preview**
- `npm start -- <facebook|photos|directory|load|validate>` — run a single stage
- `npm start -- browser-import --facebook-file <json> --directory-file <json>` — merge and validate the two browser downloads
- `npm run add-admin -- <netid>` — grant a netid access to the dashboard (required to bootstrap the first admin)
- `npm run add-admin -- <netid> --only` — make that netid the sole dashboard admin
- `npm run qc` / `npm run qc:fix` — data quality checks
- `npm run enrich-missing -- --cookie <c>` — backfill netids for rows missing them

Cookies are copied by hand from DevTools after logging into students.yale.edu/facebook
and directory.yale.edu. For Face Book, capture the complete Cookie header from
an exact successful request; an arbitrary bare `JSESSIONID` may belong to the
wrong Yale app or cookie path.

## Recommended browser-export workflow

The paste-in-console scripts live in [`browser/`](../../apps/pipeline/browser/):

- [`browser/facebook-export.js`](../../apps/pipeline/browser/facebook-export.js) runs on
  `students.yale.edu/facebook`. It downloads normalized student JSON and refuses
  a roster below 5,000 people, below 14 colleges, with missing names, or with a
  major outside the approved allowlist.
- [`browser/directory-export.js`](../../apps/pipeline/browser/directory-export.js) runs on
  `directory.yale.edu`. It asks for the Facebook JSON, queries the Directory,
  and downloads a matching Directory JSON. It checkpoints every 25 students in
  IndexedDB and resumes when rerun with the same Facebook file. It can also
  repair an existing Directory JSON by selecting both files together in its
  initial multi-file chooser and querying only missing/error entries.

After both files download:

```bash
cd apps/pipeline
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

### Approved major values

[`src/allowedMajors.ts`](../../apps/pipeline/src/allowedMajors.ts) contains the 86 exact Yale College
values reviewed from production on September 23, 2026, including `Undeclared`.
Both Facebook scrapers retain the existing location checks and field boundaries,
then accept the selected major only if it matches this list after HTML decoding
and edge-whitespace trimming. Rejected candidates remain in `details_raw`; they
are not moved into the address or matched by substring. A combined value such as
`San Francisco, Computer Science` is therefore omitted, not guessed at.

Facebook/enriched-data validation and the database loader reject populated majors
outside the list, including in older cached JSON. The loader checks before
connecting or writing, and `--force` does not bypass this check. Missing majors
remain allowed. Post-load major validation is scoped to Yale College, leaving
other schools' values such as `MBA` outside this policy.

This list is intentionally based on observed values, not a complete Yale catalog.
Review new values before adding them to both `src/allowedMajors.ts` and the inline
copy in `browser/facebook-export.js`; `npm test` checks that the copies match and
that both parsers retain every allowed value without changing surrounding fields.

### Database preview and apply

For development, start `bash scripts/dev/start-proxy.sh` from the root.
For production, use the production wrapper below, which starts and verifies its
own proxy. Confirm `.config/.env.proxy` has the intended `DEV_MODE`; `--apply`
refuses a conflicting `--target` label.

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

Follow [photo runbook](photos.md) exactly. In particular, copy the
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

## Email exports

Run `bash scripts/ops/export-emails.sh 2029` from the root for one class, or
`bash scripts/ops/export-emails.sh 2027,2028,2029,2030 /private/path/emails.csv selected-majors`
for the previous filtered export. Omit `selected-majors` to include all majors.
These commands read production through a verified proxy and write a private CSV.
They are operations commands, not local checks.

## Production wrapper

From the root, `bash scripts/ops/sync-yalies-production.sh` guides the browser exports,
validates the files, discovers the production database configuration from the
Cloud Run backend, and prints a load preview. It applies only after the operator
pastes the exact database-bound `APPLY-...` token.

Resume from saved downloads with `--facebook-file FILE --directory-file FILE`.
Use `bash scripts/ops/repair-yalies-encoding-production.sh --help` for the targeted
encoding-repair workflow. Keep exported student data outside Git with mode 0600.

Production helpers require Google Cloud access, Cloud SQL Auth Proxy, `jq`, Node,
and PostgreSQL client tools. They verify the expected instance before using a
proxy. Local `.config` values can take precedence over discovered credentials;
check the intended target before proceeding.
