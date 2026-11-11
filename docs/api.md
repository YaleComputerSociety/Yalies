# API

The Express API mounts public routes under `/v3`. Local default: `http://localhost:1337`.

Route constants and request/response types are in `packages/shared`. Implementations are in `apps/api/src/helpers/routes`; server middleware and route mounting are in `apps/api/src/helpers/webServer.ts`. `/v3/ping` is the health endpoint.

Directory access, sessions, API keys, and profile mutations have different authorization requirements. Follow the middleware in the relevant router before adding a caller. OIDC protocol endpoints and integration examples are documented in [Continue with Yalies](continue-with-yalies.md).

This repository no longer uses the historical SQLite/Heroku `/v2` setup described in older documentation.

`GET /v3/profile/me/full` requires a login session (including local dev login). Alongside
`profile`, `person`, and `photo_request`, it returns `yalemoji`: either
`{ version, png_url, svg_url, background_url }` or `null`. The backend resolves the
session's NetID through Yalemoji's authenticated `/api/v1/users/{netid}` endpoint.
The app key stays on the backend. Missing configuration, an absent avatar, or an
upstream failure returns `null` without preventing the rest of the profile from loading.
