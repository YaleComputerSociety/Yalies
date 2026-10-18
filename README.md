# Yalies

The Yale identity engine.

[Onboarding](ONBOARDING.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md)

| Location | Purpose |
| --- | --- |
| `apps/web` | Public Next.js site |
| `apps/api` | Express API, CAS login, OIDC provider |
| `apps/dashboard` | Internal Next.js dashboard |
| `apps/pipeline` | Data API, import CLI, browser exporters, photo tools |
| `packages/shared` | Types, routes, validation |
| `scripts/dev` | Local launchers and diagnostics |
| `scripts/deploy` | Deployment and rollback |
| `scripts/ops` | Data maintenance |
| `docs` | Technical reference and operations |

TypeScript, React/Next.js, Express, PostgreSQL/Sequelize, and Google Cloud Storage. npm workspaces share one lockfile. Node 22 is pinned in `.nvmrc`.
