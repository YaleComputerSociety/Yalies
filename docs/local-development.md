# Local development and testing databases

## Frontend and API: start here

Developers need the repository, Git, Node 22/npm 10+, and either PostgreSQL server tools or Docker.
They do not need a production database password, service-account key, Python, or a private config bundle.
From a fresh clone:

```sh
git clone https://github.com/YaleComputerSociety/Yalies.git
cd Yalies
nvm install
nvm use
npm ci
# macOS native database; alternatively install and start Docker Desktop:
brew install postgresql@16
npm run dev:local
```

Open `http://localhost:3000`, then click **Log in**. The login bypass signs in as `dev1` (Alex Morgan).
The database contains 12 fictional people with colleges, majors, years, birthdays, and a sample profile.
Photos use the site's existing placeholder. Local photo upload/download is disabled, so existing Google
credentials cannot send a test upload to the production photo bucket. Search, filters, profile changes, likes, and friendships use
the real API and a real local database. This does not test Yale CAS, production credentials, OIDC, or facecheck.
This launcher covers the public app/API; dashboard/pipeline setup remains in [onboarding](../ONBOARDING.md).

| File or service | Purpose |
| --- | --- |
| `.nvmrc`, root `package.json` and `package-lock.json` | Runtime and all workspace dependencies |
| `scripts/dev/local.mjs`, `scripts/dev/seed-local.mjs` | Database startup, schema, fixtures, and app launch |
| `.config/local/database.json` | Generated database engine selection and random local password |
| `.config/local/backend.env` | Generated API settings, session secret, and local login identity |
| `.config/local/postgres/` | Persistent native PostgreSQL data (Docker uses a named volume instead) |
| `http://localhost:1337/v3/ping` | API health (`pong`) |
| `127.0.0.1:55432/yalies_dev` | Local database; separate from cloud proxy port 1357 |

All `.config/local` files are ignored by Git. Keep them private. The launcher never seeds a URL taken from
the existing cloud configuration. It locates the PostgreSQL server's matching tools even when Homebrew's
`libpq` client binaries are already on PATH. Linux developers can install their distribution's PostgreSQL
server and contrib/pg_trgm packages. Native Windows developers should use WSL for this launcher.
The Docker fallback uses `postgres:16`; first startup needs an image download. The native path is tested
on this Mac; Docker is an alternative and has not been exercised here.

Ctrl+C stops the apps and any database started by that invocation, retaining data. If the database was
already running, it is left running. To start only the database/schema or stop a retained database:

```sh
npm run db:local:setup
npm run db:local:stop
```

With `dev:local` running, `npm run test:local` checks health, login/session persistence, populated people,
name search, a college filter, the current profile, and the frontend HTTP response.

Seeding only runs when `person` is empty. Restarting keeps your test edits. After changing API source,
restart `dev:local`; Next.js and shared package changes reload/watch automatically. Ports 1337 and 3000
must be free. When switching Node versions for an existing checkout, run `nvm use` before launching.

## Shared development database

The shared development instance `yalies:us-central1:yalies-sql-dev` was verified to exist and be
`RUNNABLE` on PostgreSQL 16. Its schema/data and developer database credentials were not verified.
A maintainer needs to check its application schema, `pg_trgm`, and directory rows before distributing
access. The proxy creates a connection, not a database or a copy of production.

Maintainer setup:

1. Provision a separate development instance/database if needed and load its schema/data.
2. Give developers Cloud SQL Client (`roles/cloudsql.client`) access for the development instance.
3. Create development-only PostgreSQL logins and distribute their development database URLs privately.
   Google IAM/proxy access and PostgreSQL login are separate. The API's existing startup creates tables,
   a function, indexes, and columns, so its database role needs ownership/DDL rights as well as data access
   on its development schema. A SELECT-only login cannot run the complete application.
4. Supply the config files below. Set `DEV_NETID` to an actual NetID in that development database.

For public frontend/API work, developers need only these private files:

| File | Required values |
| --- | --- |
| `.config/.env.proxy` | `DEV_MODE=development`, `CLOUD_SQL_DEV_INSTANCE=yalies:us-central1:yalies-sql-dev` |
| `.config/external/.env.web` | `NEXT_PUBLIC_YALIES_API_URL=http://localhost:1337` |
| `.config/external/.env.backend.development` | `DATABASE_URL=postgresql://DEV_USER:DEV_PASSWORD@127.0.0.1:1357/postgres`, random `SESSION_SECRET`, `PORT=1337`, `NODE_ENV=development`, `AUTH_MODE=dev`, real `DEV_NETID`, `FRONTEND_URL=http://localhost:3000`, optional `ADMIN_NETIDS` |

Templates are in `config/examples`. Optional OIDC/facecheck should stay disabled until configured.
Prefer each developer's application-default Google credentials over sharing a service-account key:

```sh
gcloud auth application-default login
npm run doctor -- --cloud
bash scripts/dev/start-proxy.sh
# Separate terminals, while the proxy stays running:
npm run dev:api
npm run dev:web
```

The [Cloud SQL Auth Proxy documentation](https://docs.cloud.google.com/sql/docs/postgres/connect-auth-proxy)
describes the IAM and connection prerequisites. The local proxy script refuses `DEV_MODE=production`.
Do not use that setting for development. The optional dashboard/pipeline additionally need
`.config/internal/.env.dashboard` and `.config/internal/.env.data-pipeline`, plus an admin-table entry.

## Testing with a copy of the real directory

### Import the supplied 250-person SQL sample

The private file `.config/local/people-sample-250.sql` contains 250 distinct randomly selected
production directory identities. It includes names, NetIDs, schools, years, colleges, majors,
curriculum, photo URLs, emails, birthday month/day, and city/state/country. Fields missing in production
remain empty: the current sample has 235 emails, 43 birthdays, and 172 locations. Phone numbers,
street-address lines, UPI/access codes, user profiles, sessions, API keys, and OIDC data are excluded.
Photo URLs still load images from the existing remote
photo host; image files are not bundled. Keep the SQL private and out of Git.

The recipient needs a checkout containing the local dev scripts introduced in this change, Node 22,
and PostgreSQL server tools or Docker. These scripts must be shared/merged with the code; receiving
the private SQL file does not install them. After `nvm use`, `npm ci`, and installing PostgreSQL (macOS:
`brew install postgresql@16`) or starting Docker Desktop:

```sh
# Stop any running dev:local process with Ctrl+C first.
npm run db:local:setup
npm run db:local:import -- /absolute/path/to/people-sample-250.sql
npm run dev:local
```

Open `http://localhost:3000` and log in. If you were already logged in with fictional fixtures,
visit `http://localhost:1337/v3/login` once to create a new session for an imported identity.
The homepage defaults to Yale College, so it can show fewer than the full 250 sampled identities;
the sample is random across directory users, not restricted to students. `npm run test:local`
checks login, search, filtering, profiles, and frontend availability.

No Google Cloud account or production credentials are required to import or run the sample. The
importer ignores `DATABASE_URL`, connects only to `127.0.0.1:55432/yalies_dev`, and requires the apps
to be stopped. It replaces local people and clears associated local test sessions/social data in
one transaction. Before replacement, it saves those local tables as a SQL backup in
`.config/local/backups/`. A backup can be restored with the same `db:local:import` command.
The sample SQL itself also checks that the database and role are both `yalies_dev`.

Maintainers can generate a new private sample with `node scripts/ops/export-dev-sample.mjs` using
existing Google credentials. It verifies the production instance, opens a read-only transaction,
samples 250 unique usable NetIDs with `ORDER BY random()`, and closes its temporary proxy afterward.
It refuses to overwrite an existing sample. This is a production **read**; run it only when an export
has been authorized. Developers receiving the file do not run this exporter.

With explicit approval for emails, birthday month/day, and city/state/country, a maintainer can enrich
the same existing sample using `node scripts/ops/export-dev-sample.mjs --include-email-birthdays-location`.
This keeps the original 250 IDs, backs up the previous SQL, and replaces the sample file. The address
is reduced to its final line, matching the API's location display; earlier street-address lines are omitted.

### Other development snapshots

Use a periodically refreshed development snapshot. A maintainer can populate the shared development
database from production, remove sessions/API keys/OIDC secrets and user-generated personal content,
and anonymize fields that are unnecessary for the test. Developers can then test against that shared
copy or restore just the `person` data locally. The application never needs a live production connection.
Production photo URLs remain remote URLs unless photos are separately copied; the default fixtures have none.

For a maintainer-approved **development** source, export only directory rows. Set `DEV_DATABASE_URL`
privately to that source connection. Use `pg_dump` compatible with the source and destination server
versions; for a PostgreSQL 16 source/local target, use PostgreSQL 16 tools.

```sh
mkdir -p .config/local
pg_dump "$DEV_DATABASE_URL" --data-only --table=public.person \
  --no-owner --no-privileges --file=.config/local/people.sql
```

This [pg_dump selection](https://www.postgresql.org/docs/16/app-pgdump.html) excludes other tables,
including login sessions and API keys. Keep the resulting snapshot private and out of Git.
Stop the local frontend/API before restoring. The following command replaces the disposable local people
and clears their local profile/social/auth test records in one transaction. It does not contact the source.

```sh
npm run db:local:setup
# Load the generated local connection without printing it:
set -a
source .config/local/backend.env
set +a
# Verify the destination before replacing any local fixtures:
node -e 'const u=new URL(process.env.DATABASE_URL); if(u.hostname!=="127.0.0.1" || u.port!=="55432" || u.pathname!=="/yalies_dev") process.exit(1)' && \
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -c 'TRUNCATE person, session, api_key, user_profile, profile_like, friendship, data_change_request' \
  -f .config/local/people.sql
unset DATABASE_URL SESSION_SECRET
npm run dev:local
```

Do not continue if destination verification fails. The next launch preserves the imported people and
chooses an existing NetID for local login (`dev1` if present, otherwise the first person with a NetID).
Source and local `person` schemas must match; restore errors roll back the replacement transaction.
No production snapshot is bundled or automatically downloaded by this workflow.
