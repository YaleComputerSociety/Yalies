# Yalies Internal

The operator-facing half of Yalies v3: an admin **dashboard** that drives a **data pipeline** which scrapes the Yale Face Book + Directory, validates/enriches the data and photos, and syncs it into the same production Postgres `person` table and `yalies-photos` GCS bucket the public site serves.

Built by Matei. This doc is the "how it works / how to run it / what's not stable yet" reference for the team.

## The two services

| | what | port | stack |
|---|---|---|---|
| `yalies-dashboard` | admin UI (thin client) | 3001 | Next.js 14 App Router, static export (`output: "export"`) |
| `yalies-data-pipeline` | the API + the actual scraper/sync | 8080 | Express + Sequelize, plus a standalone Python ML toolkit |

The dashboard does no real work — it calls the pipeline cross-origin (`credentials: "include"`). Everything is gated by Yale CAS + an `admin` table.

## Data flow (the whole point)

```
Yale Face Book ──(JSESSIONID cookie)──┐
                                      ├─► scrape ─► enrich ─► validate ─► SYNC ─► Postgres `person`  ─► public site
Yale Directory ──(_people_search…)────┘            │                                    + photos ─► GCS `yalies-photos`
                                                   └─ photos pulled into GCS
```

1. **Scrape** (`yalies-data-pipeline/src/sources/facebook.ts`) — one request to `students.yale.edu/facebook` (the `currentIndex=-1&numberToGet=-1` trick grabs the whole roster), parsed with cheerio into `output/students.json`. Photo copying is a separate opt-in stage.
2. **Enrich** (`src/sources/directory.ts`) — for each student, looks them up in `directory.yale.edu/api` (needs a CSRF token + cookie) to get authoritative netid/email/UPI/college/year, writing `output/students_enriched.json`. Multi-match is scored by college+year.
3. **Validate** (`src/validate.ts`) — sanity thresholds from `yalies-shared/validation.ts` (≈6000–8000 students, 14 colleges, years 2026–2029).
4. **Sync** (`src/loadDb.ts`) — ⚠️ **destructive**: in one transaction it snapshots, `DELETE`s every Yale College row in the shared `person` table, and re-inserts the scraped set. The CLI defaults to preview and requires a database-bound plan token to apply.

The pipeline only touches Postgres + GCS. The public backend searches the shared
Postgres `person` table directly, so newly synced records are immediately
searchable without maintaining a separate search index.

## Run it locally (3 terminals, from the repo root)

```bash
./start-proxy.sh           # 1. Cloud SQL Auth Proxy on :1357
./start-data-pipeline.sh   # 2. pipeline API on :8080  (tsc && node build/server.js)
./start-dashboard.sh       # 3. dashboard on :3001     (next dev)
```

Health check: `curl localhost:8080/health` → `{"status":"ok"}`, then open `http://localhost:3001`.

**Before any of that works:**
- **Secrets** — everything reads from a `.config/` directory **one level above the repo root** (`<parent>/.config`, intentionally outside git). It is **not in this checkout and has no template** (see blockers). Layout the code expects:
  - `.config/.env.proxy` → `DEV_MODE` (`production`|`development`), `CLOUD_SQL_PROD_INSTANCE`, `CLOUD_SQL_DEV_INSTANCE`
  - `.config/gcloud/service-key.json` → GCP service account (proxy + GCS)
  - `.config/internal/.env.data-pipeline` → `DATABASE_URL`, `SESSION_SECRET`, `AUTH_MODE` (`cas`|`dev`), `DASHBOARD_URL`, `NODE_ENV`, `PORT` (opt), `DEV_NETID` (dev only)
  - `.config/internal/.env.dashboard` → `NEXT_PUBLIC_SCRAPER_API_URL` (pipeline base), `NEXT_PUBLIC_BACKEND_API_URL` (external backend, only for the facecheck toggle)
- **Admin access** — every real route 403s unless your netid is in the `admin` table. There's no UI/seed for this: `INSERT INTO admin (netid) VALUES ('yournetid');`.
- **Local login without CAS** — set `AUTH_MODE=dev` + `NODE_ENV=development` + `DEV_NETID=<you>` to bypass Yale CAS.

**Node:** pipeline & dashboard pin `20.13.0` (`.nvmrc`); the external backend uses 22 — don't assume one version across the monorepo.

**CLI (no dashboard):** from `yalies-data-pipeline`, `npm start -- all --facebook-cookie <JSESSIONID> --directory-cookie <session>` (or run `facebook` / `directory` / `load` / `validate` individually; `load` previews by default, `--apply` plus its printed plan token writes, and `--start-from N` resumes enrichment). Cookies are copied by hand from DevTools after logging into each Yale site.

**Recommended no-cookie data workflow:** paste the scripts in
`yalies-data-pipeline/browser/` into the Face Book and Directory consoles, then
run `browser-import`, `load` (preview), and `load --apply --target ... --confirm
APPLY-...`. See [`yalies-data-pipeline/README.md`](yalies-data-pipeline/README.md)
for the exact production runbook.

## Using the dashboard

- **Wizard** (`src/components/Wizard.tsx`): cookie → scrape Face Book → cookie → enrich Directory → review/sync. Step state is in-memory only — a refresh resets it. Scrape/enrich stream live progress over SSE (custom `fetch` + `ReadableStream` reader in `src/hooks/useSSE.ts`, because the browser `EventSource` can't POST). Cookie capture tries to embed Yale in an iframe — Yale's `X-Frame-Options` will usually blank it, so "Open in new tab" is the real path.
- **Database Explorer** (`src/app/database/page.tsx`): overview stats, paginated student CRUD, photo upload/download (writes straight to `yalies-photos`), and review of user-submitted change requests. The admin photo upload here does **not** run face-check (that toggle only governs the public self-serve upload on the external site).

## Python tools (optional, manual)

`yalies-data-pipeline/python/` — **not invoked by the TS pipeline**; run by hand.
- `facecheck/facecheck.py` — InsightFace face detect/compare (CPU). The **only programmatic caller is the external backend** (`yalies-external/.../facecheck.ts`), which shells out to it during public photo uploads via a sibling-checkout relative path and an expected venv at `python/venv/bin/python`. If that path/venv is missing, the external backend silently skips face-check.
- `enhancer/enhance.py` — GFPGAN upscale + LaMa watermark removal, reads/writes `yalies-photos` (`<id>_enhanced.jpg`). Nothing consumes the enhanced variants yet.
- Reproducibility is rough: deps are unpinned (`requirements.txt` uses `>=`), the venv + model weights are gitignored, and the stack (gfpgan/basicsr/torch) is fragile on Python 3.12/3.13 — use 3.10/3.11.

## How it couples to the public site

It shares **infrastructure, not code**: the same Cloud SQL `person` table (synced destructively), the same `yalies-photos` bucket (photo URLs are `https://storage.googleapis.com/yalies-photos/<id>.jpg`, stored in `person.image`), the same Yale CAS, and the same GCP service account. A bad sync directly degrades the live site.

## Remaining operational limitations

- The Face Book HTML/API shape is undocumented and can drift. Both browser and
  server scrapers use count/college/field validation, but an annual run still
  needs human review.
- Dashboard scrape state remains in-memory. The browser-export + CLI workflow is
  restart-safe and is the recommended production path.
- The dashboard now blocks validation failures and has the 80% size guard, but
  it does not use the CLI's database-bound plan token. Prefer the CLI for live
  replacement.
- The internal dashboard/pipeline still have no committed deployment path; they
  are designed to run locally through Cloud SQL Auth Proxy.
- Browser JSON does not include photo bytes. New/missing photos need the separate
  authenticated `photos` stage.
- `.config` is intentionally outside git. Key names are documented above, but a
  new operator still needs the actual values/service account from the team vault.
- Expected cohort years are deliberately hardcoded and must be reviewed during
  each annual refresh. They currently represent academic year 2026–27.

## Open questions for Matei / Jeet

1. Where does `.config` live and how does a new teammate get it (DB URL, `SESSION_SECRET`, service key, Cloud SQL instance names)?
2. Is the pipeline server meant to stay local-only or eventually be deployed?
3. Is `Photo?id=` definitively keyed by Face Book `photo_id` across every photo tool?
4. Is the Python enhance/facecheck tooling part of the release cycle or a one-off pass? Where do the model weights come from?
5. Does face-check actually run in prod, given `yalies-internal` isn't co-deployed with the external backend (it silently skips if the script isn't found)?
