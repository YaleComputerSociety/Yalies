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
