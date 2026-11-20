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

Search responses from `POST /v3/people` include `yalemoji` on each person:
`{ version, png_url, svg_url, background_url }` or `null`. Before returning each
page (including cached directory results), the backend batches its NetIDs through
Yalemoji's server-authenticated `POST /api/v1/lookup` endpoint, up to 100 per
request. Missing avatars and temporary lookup failures render the public default
`https://www.yalemoji.com/assets/default-avatar.png?v=3`. Directory photos remain
in `image`; the transparent Yalemoji appears separately in each card's lower right.

Saved contacts and lists require a login session. `GET /v3/saved/me` lists the
session owner's saves; `GET`, `PUT`, `PATCH`, and `DELETE /v3/saved/:netid` read,
save, edit a private note, or unsave a person. List creation and listing use
`/v3/saved-lists`; rename/delete use `/v3/saved-lists/:id`, and removing a member
uses `DELETE /v3/saved-lists/:id/members/:netid`. Deleting a list keeps its people saved.

For session-authenticated search, `POST /v3/people` accepts `is_saved: ["true"]`
and `saved_list: ["LIST_ID"]` filters and includes `saved_data` with `saved`,
`note`, and `list_ids`. Saved browsing is newest first; name and birthday searches
retain their relevance/proximity ordering and YaleMoji enrichment. Directory API
keys never receive `saved_data` or saved-filter results, including cached responses.

The old friendship table is retained, but its routes are removed. Existing
friendships are not automatically converted to saves; that migration remains a
separate deployment prerequisite.
