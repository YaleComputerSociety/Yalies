# Deployment

Deployment remains manual. CI runs checks only. No deployment, production database command, or remote branch change was performed during this refactor.

## Packaging

Run from the repository root with Node from `.nvmrc`. Commit new deployment inputs before packaging: `scripts/deploy/stage.mjs` copies tracked source files from the working tree into a temporary directory and excludes local config and generated output.

- API: `bash scripts/deploy/api.sh`. Stages the workspace, builds `apps/api/Dockerfile`, deploys Cloud Run, then sends traffic to the latest revision.
- Web: `bash scripts/deploy/web.sh`. Stages the workspace, installs from the root lockfile, packs shared code into a tarball, and gives Firebase an isolated frontend source directory. The standalone package keeps the frontend versions from the root lockfile. Only the staged manifest changes. The API origin is explicitly `https://api.yalies.io`.
- Preview: `PREVIEW_ENV_FILE=/private/path/runtime.json bash deploy/preview/deploy.sh`. Uses the development database and rejects a production target. See [preview notes](../deploy/preview/README.md).

These commands change remote state. Packaging paths and shell syntax were checked locally; Cloud Run/Firebase deployment behavior still requires an operator-controlled validation. Docker is not installed on the refactor machine, so container builds were not run there.

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
