# Architecture

The public web app calls the Express API under `/v3`. The API handles directory search, profiles, sessions, CAS, and the OIDC provider. PostgreSQL holds people, profiles, session records, and OIDC state. Google Cloud Storage holds photos.

The dashboard calls the pipeline API and public API. The pipeline imports and validates directory data before loading the shared database. Its CLI and browser exporters live alongside the service; Python tools handle optional image processing.

`yalies-shared` owns public types, route constants, and common validation. Consumers depend on the workspace package, not another app’s source. Builds compile shared code first. Local launchers watch it; server processes still need restarting to load changed modules.

The API’s optional face-check subprocess is the one cross-app runtime dependency. Its default paths resolve into `apps/pipeline/python`; `FACECHECK_SCRIPT` and `FACECHECK_PYTHON` override them. API deployment images do not bundle the Python environment. Provision it separately or disable face-check explicitly.

Config lives in ignored `.config` files. Server loaders resolve these from their modules; Next.js launchers copy public settings to each app’s ignored `.env.local`. Do not put credentials in `NEXT_PUBLIC_*` values.

The data loader replaces Yale College rows in one transaction after validation
and a snapshot. CLI loading defaults to preview and requires a database-bound
plan token to apply. These changes reach public search immediately because the
API reads the same `person` table; no search-index rebuild is required.
