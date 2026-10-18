# Workspace refactor verification

## Baseline

Checkpoint: `b95f2ac` on `yavin/continue-with-yalies`. This commit preserves the nine pre-existing changed/new files before any refactor edits.

Checks used Node 22.23.3:

| Check | Before refactor |
| --- | --- |
| Shared and API compilation | Passed |
| Pipeline test script | Passed, but discovered only 3 tests |
| Explicit full pipeline suite | 23 passed |
| Pipeline lint | Passed |
| API lint | One missing trailing comma |
| Web lint | Passed with a local API URL; failed without it |
| Web build | Failed to resolve `yalies-shared` |

Dashboard login/CAS was not tested. No application database or public service was used.

## Result

- Clean staged source installs with `npm ci`; shared output is generated automatically.
- `npm run check` passes: lint, all workspace type checks, and all 23 pipeline tests.
- All 32 API integration tests pass against an isolated local PostgreSQL 18.4 cluster with `pg_trgm`. The test process uses local HTTP fixtures and mocked CAS. The cluster was stopped afterward. CI uses PostgreSQL 16; that exact CI version was not run locally.
- Web, dashboard, API, and pipeline compile on Node 22.23.3. Web builds need network access for the existing Google Fonts dependency.
- A clean staged workspace passes the full build. The standalone Firebase source also installs and builds independently, using the shared tarball and frontend versions from the root lockfile.
- Shell syntax and local Markdown links pass inspection. Doctor correctly reports the two missing external config files in this checkout and verifies local port availability. Existing `.config` files were not changed.

## Decisions

The root lockfile preserves existing resolved dependency versions, including the two API Git dependencies pinned to their original commits. Those Git URLs now use HTTPS. Dependencies remain nested where needed to avoid a dependency refresh during the move. Framework upgrades and broad dependency deduplication are separate work.

The API explicitly emits ES modules so its module-relative config and Python paths work. Pipeline config paths also resolve from modules. The Python credential path follows the new layout; Python packages/models were not installed or validated.

Development launchers no longer install packages or start a database proxy implicitly. The proxy launcher refuses production mode. Operations commands retain their separate production checks. Duplicate email exports are one parameterized command; the unsupported raw-HTML browser collector was removed.

## Remaining validation

- Dashboard CAS and interactive dashboard behavior remain unverified, as requested.
- Docker images and Cloud Run/Firebase deployments were not executed. Verify those with operator-controlled staging before production use.
- Lint still reports existing hook-dependency and unused-variable warnings. No blanket suppression was added.
- npm reports deprecations and a security advisory for the existing Next.js 14.2.7 version. No framework upgrade was mixed into this refactor; address it before the next public rollout.
- GitHub branch protections, remote default branch, and external deployment hooks were not changed. The old local `main` has unrelated history; cached `origin/main` is a different tip. Both are preserved. See [branch handoff](deployment.md#branch-handoff) before the final push.
