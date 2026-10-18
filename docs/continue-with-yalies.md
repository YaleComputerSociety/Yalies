# Continue with Yalies (V1)

Yale CAS → existing Passport/Yalies session → Yalies OIDC provider → approved application.
Yuttler is the first client. Its relying-party integration now lives in `~/community/yuttler`.
See [deployment and rollback commands](continue-with-yalies-deploy.md) for the coordinated setup.

The implementation uses pinned `oidc-provider@9.12.2` on Node **22.23.1 or newer Node 22**.
See the [provider documentation](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md).
It provides authorization code flow, mandatory S256 PKCE, RS256 ID tokens, discovery and UserInfo.
Authorization codes last 60 seconds, interactions/grants 10 minutes, and tokens 5 minutes.
No refresh tokens, implicit/password grants, dynamic registration, or OAuth API access to the directory.
Yalies API keys remain completely separate.

## Files and rollout

Backend: `apps/api`.
Frontend: `apps/web`.

New backend `src/helpers/oidc/` contains configuration/routes, client/artifact models and adapter,
secret/subject helpers, and the CAS continuation helper. The only existing auth changes are
capturing an optional internal continuation before Passport regenerates the session and saving
the session before redirecting. The separate `/login/yalemoji` handler is unchanged.

The feature is **off unless `OIDC_ENABLED=true`**. Apply the SQL migration, register an approved
client, provision secrets, then enable it. Startup registers Sequelize models but does not create
or alter these tables. No production deployment or migration is performed by this implementation.

The new frontend `/connect` route is independent of normal navigation. It uses existing theme
colors and the Yalies logo, omits the normal navbar, disables analytics on this route, prevents
framing and suppresses referrers. Only the current user's display name and school are returned to
this first-party UI. School is **not** an OIDC claim; profile photos are deliberately omitted.

## Configuration

| Variable | Value / purpose |
| --- | --- |
| `OIDC_ENABLED` | `true` to mount the provider; otherwise existing app only |
| `OIDC_ISSUER` | Canonical backend origin, no trailing slash; locally `http://localhost:1337` |
| `FRONTEND_URL` | Existing canonical Yalies frontend origin; locally `http://localhost:3000` |
| `OIDC_SUBJECT_SECRET` | Persistent random secret, at least 32 characters; protect and back up |
| `OIDC_COOKIE_KEYS` | JSON array of persistent random secrets, each at least 32 characters; newest first |
| `OIDC_JWKS` | JSON JWKS containing a private RSA signing key with `kid`, preferably `alg: RS256`, `use: sig` |
| `DATABASE_URL` | Existing Postgres connection, with migration applied |
| `SESSION_SECRET` | Existing Yalies session secret, shared across instances |
| `NODE_ENV` | `development` locally; `production` in Cloud Run |
| `PORT` | Existing backend port, `1337` locally |
| `AUTH_MODE` | Existing `cas` mode, or `dev` **only locally** |
| `DEV_NETID` | With local dev login, a NetID present in the local directory |
| `NEXT_PUBLIC_YALIES_API_URL` | Frontend build-time backend origin; locally `http://localhost:1337` |

Existing development startup loads `.config/external/.env.backend.development` (relative to repo
root) with override enabled. Put local backend settings there; do not commit secrets. CLI tools
use environment variables directly and do not automatically load that file.

Generate separate subject/cookie/client secrets using `node -e
'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'`.
Generate and store the private JWKS once in your secret manager, for example:

```js
import { generateKeyPairSync, randomUUID } from "node:crypto";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
console.log(JSON.stringify({ keys: [{
  ...privateKey.export({ format: "jwk" }), kid: randomUUID(), alg: "RS256", use: "sig",
}] }));
```

Only development permits an ephemeral signing key when `OIDC_JWKS` is absent; restarting then
invalidates local tokens. Production fails startup without keys, persistent secrets, HTTPS
origins, or if dev login is enabled. Persist the issuer, subject secret and client IDs: changing
any of them changes identity semantics. Coordinate signing-key rotation and retain old public
verification keys for outstanding tokens. Cookie signing keys support rotation by retaining
older entries after the new first key.

## Database

Apply once with the migration role, against the intended database:

```sh
cd apps/api
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260923_continue_with_yalies.sql
```

The transactional migration creates only:

- `oauth_client`: approved client name/logo, exact redirects, allowed scopes, active/development/
  confidential flags, scrypt secret hash and timestamps.
- `oauth_artifact`: provider-managed interactions, sessions, grants, codes and access tokens,
  with expiry, consumed marker, and grant/lookup indexes.

The adapter atomically consumes authorization codes with a conditional Postgres update. Saving
a stale artifact never resets consumption. All instances share this state. Treat artifact
payloads as authentication data: restrict database access, backups and exports.

Run `DELETE FROM oauth_artifact WHERE expires_at < NOW();` periodically (e.g. hourly) via an
existing scheduled maintenance job. Expired rows are never usable even before cleanup. No
in-process timer or new schema management framework is required. To roll back, disable OIDC
first; preserve tables unless intentionally invalidating all clients and outstanding grants.

## Register Yuttler

Use a separately generated **development** secret; the script never prints it or stores plaintext.

```sh
cd apps/api
export DATABASE_URL='postgres://...local-development-database...'
export OIDC_CLIENT_SECRET='your-random-development-secret-at-least-32-characters'
npm run oidc:register -- --development
```

The default registration is `client_id=yuttler`, display name `Yuttler`, scope `openid profile`,
confidential HTTP Basic authentication, and exactly
`http://localhost:3001/auth/yalies/callback`.

For production, run against production only as a deliberate operator step:

```sh
export OIDC_CLIENT_ID='yuttler'
export OIDC_CLIENT_NAME='Yuttler'
export OIDC_CLIENT_REDIRECT_URIS='["https://yuttler.com/auth/yalies/callback"]'
export OIDC_CLIENT_SECRET='a-separate-production-secret-from-your-secret-manager'
# Optional: OIDC_CLIENT_LOGO_URI=https://.../trusted-app-logo.png
npm run oidc:register
```

Yuttler's frontend must rewrite `/auth/*` to `https://yuttler-6t2q.onrender.com/auth/*`, preserving
cookies and methods; the browser callback remains on yuttler.com. No new DNS is needed.
Use `--replace` only when intentionally
updating an existing client or rotating its secret. It also sets `active=true`. There is no
client-list/secret-retrieval API or developer portal. Disable a client with an explicit operator
update of `oauth_client.active=false`; every authorization and token request re-reads approval.
Development registrations are rejected by production servers.

All redirects must be canonical, exact URLs without credentials, fragments or wildcards. HTTPS
is mandatory except `http://localhost` for a development registration. V1 public-client support
uses `confidential=false`, `secret_hash=NULL`, and `token_endpoint_auth_method=none`; it still
requires S256. The registration script intentionally provisions confidential clients only.

## Endpoints

With local issuer `http://localhost:1337`:

| Purpose | URL |
| --- | --- |
| Discovery | `http://localhost:1337/.well-known/openid-configuration` |
| Authorization (GET) | `http://localhost:1337/oauth/authorize` |
| Token exchange (POST) | `http://localhost:1337/oauth/token` |
| Public JWKS | `http://localhost:1337/oauth/jwks` |
| UserInfo | `http://localhost:1337/oauth/userinfo` |
| Browser interaction | `http://localhost:1337/oauth/interaction/:uid` |
| First-party consent UI | `http://localhost:3000/connect?interaction=:uid` |

Production uses the same paths under the configured issuer/frontend. Integrators use discovery,
not interaction endpoints. On this branch CAS login is mounted at the shared `API_ROUTES.login`
path; the interaction redirects there automatically. A session-stored, expiring interaction ID
survives CAS and Passport session regeneration. No external `returnTo` is accepted.

## Exact Yuttler integration contract

Yuttler backend configuration:

```dotenv
YALIES_ISSUER=http://localhost:1337
YALIES_CLIENT_ID=yuttler
YALIES_CLIENT_SECRET=<same development secret used at registration>
YALIES_REDIRECT_URI=http://localhost:3001/auth/yalies/callback
YUTTLER_FRONTEND_ORIGIN=http://localhost:5173
YUTTLER_PROXY_ORIGIN=http://localhost:3001
YUTTLER_SESSION_SECRET=<independent random secret>
```

Use a maintained OIDC relying-party library for discovery, code exchange and ID-token validation.
No account database is required: identify a user by **`(iss, sub)`**, and keep the minimal user in
Yuttler's own session. For local testing, one Express process can use a memory session store;
production sessions need a durable/shared store or an appropriately protected cookie-session
design. Do not put Yalies tokens or client secrets in React, localStorage, messages or URLs.

Implement these four routes on the **existing Express proxy**:

1. `GET /auth/yalies/start`: generate independent cryptographically random state, nonce and a
   32-byte base64url PKCE verifier. Save `{state, nonce, verifier, createdAt}` in the browser-bound
   server session (a bounded map keyed by state handles parallel popups). Save before redirect.
   Compute `BASE64URL(SHA256(ASCII(verifier)))`, without padding, then redirect to authorization:

   ```text
   response_type=code
   response_mode=query
   client_id=yuttler
   redirect_uri=http://localhost:3001/auth/yalies/callback
   scope=openid profile
   state=<random state>
   nonce=<random nonce>
   code_challenge=<S256 challenge>
   code_challenge_method=S256
   ```

   URL-encode each parameter. State and nonce are required by this V1 policy. The provider echoes
   state and binds nonce into the signed ID token; **Yuttler must compare both against its saved
   values**. Do not send `max_age` or `prompt=login`; V1 does not promise forced CAS reauthentication.

2. `GET /auth/yalies/callback`: reject missing/duplicate/mismatched/expired state, consume the
   pending transaction exactly once, and handle `error=access_denied` as cancellation without
   establishing a session. Check `iss` in the authorization response when present. For success,
   exchange the single-use code immediately, server-to-server:

   ```http
   POST /oauth/token
   Content-Type: application/x-www-form-urlencoded
   Authorization: Basic BASE64(FORM_ENCODE(client_id) + ":" + FORM_ENCODE(client_secret))

   grant_type=authorization_code&code=CODE&redirect_uri=EXACT_REGISTERED_URI&code_verifier=VERIFIER
   ```

   Use the original exact callback and verifier. The successful response includes `access_token`,
   `token_type: Bearer`, `expires_in`, `scope`, and `id_token`; no refresh token. Validate RS256
   signature using discovered JWKS, exact issuer, audience/client ID (and `azp` when applicable),
   expiry/issued-at, nonce and library-required token hashes. **Decoding a JWT is not validation.**
   Expected identity claims for `openid profile` are opaque `sub` and display `name`, alongside
   standard protocol claims (`iss`, `aud`, `iat`, `exp`, `nonce`, possibly hashes/session metadata).
   No NetID, email, UPI, birth date, phone, address, mailbox or access code is disclosed.
   `openid` alone does not include `name`. UserInfo is optional; the ID token already includes
   the profile name. Access tokens work only at OIDC UserInfo, not Yalies directory APIs.

   Regenerate Yuttler's session ID at login and save `{issuer, sub, name}`. Use HttpOnly cookies,
   Secure in production, an appropriate SameSite policy and bounded lifetime. Then serve a tiny
   `Cache-Control: no-store`, `Referrer-Policy: no-referrer` callback document. It must not load
   analytics or third-party assets. With the exact frontend origin safely JSON-encoded as a
   trusted server configuration value:

   ```js
   window.opener?.postMessage({ type: "yalies-auth-complete" }, EXACT_YUTTLER_FRONTEND_ORIGIN);
   window.close();
   ```

   Send no tokens/profile in the message. The same completion notification may follow a
   validated cancellation; `/auth/me` remains signed out. Give a readable fallback if no opener
   exists. Unknown/mismatched state must fail closed, never log in or redirect to arbitrary input.

3. `GET /auth/me`: return `Cache-Control: no-store` and `{user: null}` or
   `{user: {sub, name}}` from the Yuttler session. Never return Yalies tokens.
4. `POST /auth/logout`: enforce exact allowed Origin plus CSRF protection, destroy the Yuttler
   session and clear its cookie. It does not log the user out of Yalies or Yale CAS.

React/Vite changes:

- Add one accessible button using the Yalies logo and text **Continue with Yalies**. On a user
  click, call `window.open(PROXY_ORIGIN + "/auth/yalies/start", uniqueName,
  "popup,width=480,height=620")`. Keep the returned popup reference; handle popup blocking.
  A same-origin `/auth/yalies/start` proxy route is also fine. Do not use `noopener` for this flow.
- Listen for `message` and require all three: `event.origin === YUTTLER_PROXY_ORIGIN`,
  `event.source === savedPopup`, and `event.data?.type === "yalies-auth-complete"`.
  **The sender origin is the callback/proxy origin, not the frontend origin** when hosted
  separately. The callback's `postMessage` *target* is the exact frontend origin, never `"*"`.
- On a valid completion, fetch `/auth/me` with `credentials: "include"` and display logged-in
  state. Remove listeners on unmount and handle popup close/cancellation. Logout calls the
  protected POST route and clears displayed state.
- The Yuttler proxy's CORS must allow only the exact frontend origin with credentials. Ensure
  its callback cookie is sent on a top-level GET. If frontend and proxy are cross-site, test
  browser third-party-cookie restrictions; a same-origin proxy path avoids that dependency
  without requiring new DNS. Avoid COOP `same-origin` on these pages, which severs the opener;
  use a popup-compatible policy and retain the origin/source checks.

## Local verification

Run the existing shared/backend/frontend setup with Node 22. Build shared if necessary, configure
the environment, apply the migration, and register the dev client above. Start backend on 1337
and frontend on 3000 (`NEXT_PUBLIC_YALIES_API_URL=http://localhost:1337`). In local dev auth mode,
`DEV_NETID` must exist in your local `person` table. Yuttler runs Vite on 5173 and its proxy on
3001. Start from Yuttler's `/auth/yalies/start`, not a hand-written static authorization URL:
the client must hold the matching state/nonce/verifier.

Test signed-out → CAS/dev login → same interaction → consent → callback, then repeat while
signed in (no CAS). Test Cancel, expired interaction, popup close, invalid redirects and a second
attempt to exchange the same code. True CAS verification requires a browser and Yale credentials;
automated tests replace only external ticket validation, exercising the real Passport/CAS route.

Repeatable isolated protocol tests (do not use a production database):

```sh
docker run --rm -d --name yalies-oidc-test -e POSTGRES_PASSWORD=local-oidc-tests \
  -p 127.0.0.1:55439:5432 postgres:16-alpine
cd apps/api
OIDC_TEST_DATABASE_URL=postgres://postgres:local-oidc-tests@localhost:55439/postgres npm run test:oidc
docker stop yalies-oidc-test
```

Tests create/drop a uniquely named schema, apply the actual migration and exercise HTTP discovery,
consent, simulated CAS continuation, JWT verification, minimal claims, unknown/inactive clients,
redirect and PKCE rejection, secret checking, code expiry, simultaneous code replay, CSRF, and
legacy session authentication. Backend `npm run build` and frontend `npm run build` are also
required. Frontend build needs `NEXT_PUBLIC_YALIES_API_URL` and access to its existing Google Fonts.

## Production boundaries and V1 limitations

- Always show consent; no connection-management UI, refresh/offline access, federated logout,
  forced CAS freshness (`max_age`, `prompt=login`), or POST authorization requests. Silent
  `prompt=none` cannot bypass consent. Response mode is `query` only.
- Subjects are HMAC-derived from the normalized CAS NetID and client ID, not exposed NetIDs or
  directory numeric IDs. They are stable per client and cannot be correlated by clients using
  different IDs. There is no new account table. NetID reassignment requires an identity-lifecycle
  decision; changing the subject secret requires an explicit account migration.
- One outstanding CAS continuation per Yalies session is supported. Parallel signed-in consent
  screens are supported, but concurrent signed-out CAS popups can supersede each other; retry.
- Keep Yalies frontend and backend on same-site HTTPS origins where possible. The consent UI
  needs credentialed requests to the backend. Cross-site deployments may be blocked by browser
  cookie policy; do not weaken global Yalies CORS/cookies to work around this. New OIDC CORS is
  isolated from the legacy permissive API CORS, with only first-party consent reads allowed.
- Use Cloud Run/edge request-rate limits for authorization/token endpoints, trusted TLS proxy
  routing, and restricted DB/secret access. Suppress query strings/request bodies/Authorization
  headers in access logs and error reporting for OAuth and CAS routes. Do not enable provider
  debug logging in production. The application logs only a generic OIDC server-error message.
- Disabling a client prevents new authorization/exchange and provider client lookup immediately;
  an already issued ID token may remain accepted by a relying party until expiry, and the relying
  party's own session follows its own lifetime. Logging out of Yalies does not revoke Yuttler's
  established session. New authorizations always re-check the live Yalies session.
- Private signing keys, cookie keys, subject secret and database must be shared by all instances.
  The secret-comparison hook is covered by HTTP tests and the provider version is pinned; review
  library changes and rerun the suite before upgrading.

## Implementation verification (2026-09-23)

- 26 OIDC integration tests and 6 existing name-search tests pass against disposable PostgreSQL 16.
- Backend TypeScript build and frontend production build pass on Node 22.23.1.
- Lint passes for all changed TypeScript/TSX files. Full backend lint still reports the existing
  trailing-comma error in `src/helpers/nameSearch.ts:35`; full frontend lint reports existing
  indentation errors in `src/components/FriendButton.tsx:165-170` and hook-dependency warnings.
- Chromium viewport/keyboard checks pass at 420×560, 480×620 and 320×560; expired-state rendering
  was checked. UI checks use fixture identity data; protocol tests use the real provider and DB.
- Real Yale CAS ticket validation and a deployed Yuttler integration remain manual checks.
- `npm audit` reports 33 backend dependency-tree advisories (17 high, 10 moderate, 6 low).
  None are reported for `oidc-provider`, `koa`, `jose`, `debug`, or `ms`; unrelated dependency
  upgrades were not included in this change.
- Reviewed feature changes against a snapshot of the initially dirty working tree. Existing
  edits are preserved; the Yalemoji handler and existing logout implementation are unchanged.
  Work remains uncommitted on `yavin/continue-with-yalies`; nothing was pushed or deployed.
