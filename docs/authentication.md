# Authentication

The public API uses CAS and a PostgreSQL-backed session. Local `AUTH_MODE=dev` uses `DEV_NETID`; production must use CAS. `FRONTEND_URL` controls the browser origin. The pipeline has its own session cookie (`yalies.pipeline.sid`) and checks the admin table. Bootstrap with `npm run add-admin -w yalies-data-pipeline -- NETID` against the intended database.

The dashboard CAS flow is not validated on this branch. Development bypass still requires an admin identity. Do not infer CAS readiness from compilation or unit tests.

Continue with Yalies is an OIDC provider in the API. Keep signing keys, subject secret, and cookie keys stable across deployments. See the [integration reference](continue-with-yalies.md) for endpoints, scopes, client registration, and local tests. The [rollout procedure](continue-with-yalies-deploy.md) covers the existing Yuttler integration and rollback state.
