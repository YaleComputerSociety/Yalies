# Contributing

Use [onboarding](ONBOARDING.md) for setup. Branch from `main`; keep changes scoped and explain behavior changes in the PR.

Run `npm run check` and `NEXT_PUBLIC_YALIES_API_URL=http://localhost:1337 npm run build` before review. App lint rules enforce existing formatting; avoid formatting unrelated files. Commit the root lockfile when changing dependencies:

```sh
npm install PACKAGE -w WORKSPACE_NAME
```

Database tests require a disposable PostgreSQL database with `pg_trgm`:

```sh
psql "$TEST_DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'
OIDC_TEST_DATABASE_URL="$TEST_DATABASE_URL" SEARCH_TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration
```

Use a dedicated local test database, never a Cloud SQL proxy or an application config bundle. OIDC tests create/drop an isolated schema. Search tests use a temporary table and rollback. CI provisions PostgreSQL explicitly and does not deploy.

PRs should state what changed, local checks, and any operational follow-up. Deployment scripts require a separate operator decision; merging or pushing must not be treated as deployment verification.
