# Authentication

The public API uses CAS and a PostgreSQL-backed session. Local `AUTH_MODE=dev` uses `DEV_NETID`; production must use CAS. `FRONTEND_URL` controls the browser origin. The pipeline has its own session cookie (`yalies.pipeline.sid`) and checks the Yalies database's `admin` table on every protected request. Membership is never inferred from a NetID supplied by the browser.

The first pipeline startup applies the `initial-yef3-access` migration, replacing
legacy admin entries with `yef3` only. The marker in `admin_migration` prevents
later restarts from resetting access. Administrators grant/revoke NetIDs on the
dashboard's **Access** page. Self removal is blocked, and concurrent revocations
are serialized so at least one admin remains. Recovery is available through
`npm run add-admin -w yalies-data-pipeline -- NETID` against the intended database.

Production serves the dashboard and pipeline API from one HTTPS origin. CAS must
verify the Yale account before login, and the database must list that NetID.
Sessions last up to 12 hours with HttpOnly, Secure, SameSite=Lax cookies. Removing
a member denies their next API request regardless of an existing session. The
client also rechecks membership on focus and every minute. Production rejects
development authentication. A completed Yale CAS login still needs a real Yale
account to verify; the integration tests use isolated test identities.

Continue with Yalies is an OIDC provider in the API. Keep signing keys, subject secret, and cookie keys stable across deployments. See the [integration reference](continue-with-yalies.md) for endpoints, scopes, client registration, and local tests. The [rollout procedure](continue-with-yalies-deploy.md) covers the existing Yuttler integration and rollback state.
