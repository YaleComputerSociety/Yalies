# Deployment

Deployment remains manual. CI runs checks only.

## Packaging

Run from the repository root with Node from `.nvmrc`. Commit new deployment inputs before packaging: `scripts/deploy/stage.mjs` copies tracked source files from the working tree into a temporary directory and excludes local config and generated output.

- API: `bash scripts/deploy/api.sh`. Stages the workspace, builds `apps/api/Dockerfile`, deploys Cloud Run, then sends traffic to the latest revision.
- Web: `bash scripts/deploy/web.sh`. Stages the workspace, installs from the root lockfile, packs shared code into a tarball, and gives Firebase an isolated frontend source directory. The standalone package keeps the frontend versions from the root lockfile. Only the staged manifest changes; its Node engine is normalized to `22` for Firebase Functions. The API origin is explicitly `https://api.yalies.io`.
- Preview: `PREVIEW_ENV_FILE=/private/path/runtime.json bash deploy/preview/deploy.sh`. Uses the development database and rejects a production target. See [preview notes](../deploy/preview/README.md).

These commands change remote state. Cloud Run builds the API container remotely; local Docker is not required. Verify the published services after deployment using the checks below.

## Routine frontend and backend redeploy

From the repository root, use Node 22 and a fresh writable npm cache. This avoids the
`EBADENGINE` warnings from Node 20 and the `EACCES`/`EEXIST` failure in a damaged or
unwritable default npm cache. No ownership changes or cache deletion are needed.

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 22
export npm_config_cache="$(mktemp -d "${TMPDIR:-/tmp}/yalies-npm-cache.XXXXXX")"

# Save both current Cloud Run traffic allocations and clone live Hosting for 30 days.
bash scripts/deploy/continue-with-yalies.sh checkpoint
# Keep the checkpoint directory printed above, especially when retrying a failed deploy.

bash scripts/deploy/api.sh
bash scripts/deploy/web.sh
```

The `checkpoint` command exits after saving rollback state. It does not provision OIDC
secrets, register clients, or run the OIDC migration. The `deploy` subcommand of the same
wrapper performs that broader OIDC rollout; see [its procedure](continue-with-yalies-deploy.md).
The application itself may run its existing database initialization on startup.

Check the published services after each deploy:

```sh
curl --fail --show-error https://api.yalies.io/v3/ping    # pong
curl --fail --show-error https://api.yalies.io/v3/filters # database-backed JSON
curl --fail --show-error --output /dev/null https://yalies.io/
gcloud run services list --project yalies --region us-central1
```

Check the homepage and login redirect in a browser too. These public checks do not
exercise a completed Yale CAS login or authenticated profile/search operations.

To restore both services, pass the exact checkpoint directory printed before deployment:

```sh
bash scripts/deploy/continue-with-yalies.sh rollback .config/continue-with-yalies/checkpoints/TIMESTAMP-PID
```

Omitting the directory uses the latest saved checkpoint. Do not replace the original
checkpoint with a new one when retrying a partially completed deployment.

## Admin dashboard

The production dashboard is at `https://api.yalies.io/admin/`. The public API
forwards `/admin` and `/api` to the separate `yalies-admin` Cloud Run service.
This keeps the browser on the existing Yale CAS registered hostname; Yale rejects
the new Cloud Run hostname as a CAS service. The entry point is a Yale CAS
login screen. All operational and access-management API routes require an
authenticated NetID in the Yalies PostgreSQL database's `admin` table.

Deploy with Node 22 from the repository root:

```sh
bash scripts/deploy/admin.sh \
  --env-vars-file=/private/path/admin-production.json \
  --service-account=YOUR_SERVICE_ACCOUNT \
  --network=default --subnet=default --vpc-egress=private-ranges-only
```

Keep the runtime JSON outside tracked source. It must contain `DATABASE_URL`
(the same production database used by the public API), a separate persistent
random `SESSION_SECRET`, `AUTH_MODE=cas`, `NODE_ENV=production`, and
`DASHBOARD_URL=https://api.yalies.io/admin`, and
`PIPELINE_URL=https://api.yalies.io`. The runtime service
account also needs photo bucket access to review and approve uploads. The image
sets `DASHBOARD_STATIC_DIR`, builds with `DASHBOARD_BASE_PATH=/admin`, and uses
relative pipeline API URLs. No production localhost endpoints are compiled into
the dashboard. The public backend must have
`ADMIN_SERVICE_URL=https://yalies-admin-335460719231.us-central1.run.app` and be
deployed with the forwarding middleware. The forwarding runs before public API
session middleware and body parsing, preserving admin sessions and photo uploads.

The first startup transaction resets legacy admin entries to `yef3` only and
records `initial-yef3-access` in `admin_migration`. Later deployments preserve
the Access page's grants and revocations. Database startup failures prevent the
service from listening. One instance preserves the existing pipeline's
in-memory scrape state.

Verify the admin service's `/health` returns 200, `https://api.yalies.io/api/auth`
redirects to Yale CAS with `https://api.yalies.io/api/auth` as its callback, and
anonymous requests to `/api/admins` and
`/api/database/change-requests` return 401. Complete Yale login as `yef3` to
review **Database → Change Requests** and manage **Access**. An unlisted Yale
account must be denied. Application rollback does not undo the initial access
migration or subsequent access edits.

## Rollback and migrations

Capture the current Cloud Run traffic allocation and Firebase Hosting release before deployment. The existing OIDC rollout wrapper, `scripts/deploy/continue-with-yalies.sh`, saves both and supports `rollback CHECKPOINT_DIRECTORY`. Its Hosting checkpoint expires after 30 days. See the [rollout procedure](continue-with-yalies-deploy.md) before using it.

Review SQL under `apps/api/migrations` separately. Restoring application traffic does not undo schema changes or rotate secrets back. Preserve OIDC identity secrets and database backups.

## Branch handoff

Local `main` is prepared for review; nothing is pushed. The previous local `main` and the original working branch are preserved. Before pushing, inspect the remote default branch, required checks, branch protections, and any deployment hooks configured outside this repository. Change those in GitHub only as part of the final operator handoff.

Preserved refs for this handoff:

- `yavin/continue-with-yalies`: checkpoint `b95f2ac`, including the original working changes.
- `codex/main-before-workspace-refactor-20261018`: previous local `main`, `e5c6458`.
- `codex/origin-main-before-workspace-refactor-20261018`: cached `origin/main`, `38a205f`. No fetch was performed.
- `codex/workspace-refactor`: completed refactor, also copied to local `main`.

The original local `main` and refactor have unrelated histories. Do not assume
a fast-forward push is possible. Inspect the current remote state and preserve
any remote work before deciding how to replace its branch.
