# Dashboard

Internal Next.js UI for the pipeline. Entry point: `src/app`.

Follow [onboarding](../../ONBOARDING.md), then run `npm run dev:dashboard` from the root. Shared code builds automatically.

The pipeline initializes the Yalies database's `admin` table with `yef3` as its
only member once, recorded in `admin_migration`. Subsequent restarts preserve
access changes. Sign in with Yale CAS, then open **Access** to grant or revoke
access by NetID. Every admin can manage access; self removal is blocked. The API
checks table membership on every request, including existing sessions.

Production is at `https://api.yalies.io/admin/`. The public API forwards dashboard
requests to the separate `yalies-admin` Cloud Run service, using the existing
Yale CAS registered hostname. See [deployment](../../docs/deployment.md#admin-dashboard).
