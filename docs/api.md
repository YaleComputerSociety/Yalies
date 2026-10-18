# API

The Express API mounts public routes under `/v3`. Local default: `http://localhost:1337`.

Route constants and request/response types are in `packages/shared`. Implementations are in `apps/api/src/helpers/routes`; server middleware and route mounting are in `apps/api/src/helpers/webServer.ts`. `/v3/ping` is the health endpoint.

Directory access, sessions, API keys, and profile mutations have different authorization requirements. Follow the middleware in the relevant router before adding a caller. OIDC protocol endpoints and integration examples are documented in [Continue with Yalies](continue-with-yalies.md).

This repository no longer uses the historical SQLite/Heroku `/v2` setup described in older documentation.
