# Deploy and roll back Continue with Yalies

From this repository root, deploy **both Yalies frontend and backend** with:

```sh
bash scripts/continue-with-yalies.sh deploy
```

This is an explicit production operation when **you run it**. The script was prepared but not
executed during implementation. It publishes the current working tree, including pre-existing
local edits. It does not commit, push, merge or change branches. Tests are not run by the wrapper;
the existing deploy commands still perform the builds needed to publish.

Requirements: Node 22, authenticated `gcloud` and `firebase`, npm, Python 3, jq, cloud-sql-proxy
and lsof. It uses the same production SQL connection method as this repo's existing sync script:
`yalies:us-central1:yalies-sql-prod`, a local proxy on port 1359, and the deployed DATABASE_URL.
It uses `.config/gcloud/service-key.json` if available, otherwise Google application-default
credentials. If ADC is missing, run `gcloud auth application-default login` first. You can instead
supply a reachable production DATABASE_URL explicitly. No credentials are printed.

The command:

1. Captures exact current API and Firebase SSR Cloud Run traffic revisions, and clones current
   Firebase Hosting into a unique backup channel retained for 30 days.
2. Creates or reuses persistent OIDC signing/cookie/subject secrets in Google Secret Manager and
   grants only the backend runtime account access to its three required secrets.
3. Applies the explicit two-table migration if neither table exists; stops on a partial schema.
4. Registers `yuttler` with **https://yuttler.com/auth/yalies/callback**. Existing registrations
   keep their other redirects and secret; a conflicting secret/inactive registration stops the
   operation instead of silently rotating or reactivating it.
5. Deploys the backend with OIDC enabled and its persistent secret references, then deploys the
   frontend using the existing scripts. Unrelated backend environment variables are preserved.

The secret manager values are authoritative on subsequent runs. Local copies and the matching
Yuttler environment are stored under gitignored `.config/continue-with-yalies/` with restricted
permissions. Never share or commit this directory.

## Roll back both

```sh
bash scripts/continue-with-yalies.sh rollback
```

This restores the API traffic, frontend SSR traffic and Firebase Hosting content/configuration
from the checkpoint saved immediately before the latest deploy invocation. It attempts all three
restorations even if one fails and returns nonzero on any failure. For a particular deployment,
use the checkpoint path printed by that deployment:

```sh
bash scripts/continue-with-yalies.sh rollback .config/continue-with-yalies/checkpoints/TIMESTAMP-PID
```

Do not delete the old Cloud Run revisions, Firebase SSR revision tags or the backup Hosting
channel while rollback is needed. The 30-day channel expiry bounds this convenience rollback.
The two additive OAuth tables, approved client and secrets are retained; old code ignores them.
Rollback changes live traffic, not your Git working tree. If a deployment fails halfway, use the
same rollback command. Keep the first checkpoint path when retrying a partial deployment; a new
deploy captures the state at the time of that new attempt.

Underlying mechanisms: [Cloud Run traffic rollback](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
and [Firebase Hosting channel cloning](https://firebase.google.com/docs/hosting/manage-hosting-resources).

## Yuttler activation after its PR is ready

Code is in `~/community/yuttler`, on its existing `yavin` branch. This work does not publish it.
The existing proxy is `https://yuttler-6t2q.onrender.com`.

1. Deploy that repo's frontend and proxy changes when ready (Node 22 for the proxy).
2. On the **frontend** Render service, add a **Rewrite**, before any SPA fallback:
   `/auth/*` → `https://yuttler-6t2q.onrender.com/auth/*`. Preserve methods/query strings/cookies
   and never cache these responses. This keeps the browser on yuttler.com; don't use Redirect.
3. Import `.config/continue-with-yalies/yuttler-render.env` into the **proxy's** Render environment,
   preserving its existing LocationIQ/CORS configuration. The file includes the registered
   client secret and an independent encrypted-session password. Do not put either in VITE vars.
4. Leave `VITE_AUTH_URL` and `VITE_YALIES_CALLBACK_ORIGIN` unset in production; the new button
   uses same-origin `/auth/*`. Existing `VITE_PROXY_URL` can keep its current Render value.

No new DNS or user database is required. The callback is exact-matched; redirect/security checks
were not relaxed. Yuttler's `docs/yalies-auth.md` describes local setup, endpoint behavior and
session limitations. The new cross-repo integration and deployment scripts were not tested or
executed in this turn, as requested.
