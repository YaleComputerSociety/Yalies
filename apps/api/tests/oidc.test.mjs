import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { Sequelize } from "sequelize";
import { createLocalJWKSet, jwtVerify } from "jose";
import { API_ROUTES } from "yalies-shared";
import { isOidcPath, isOidcProtocolPath, mountOidc } from "../build/helpers/oidc/provider.js";
import { OAuthClient, OAuthArtifact, SequelizeOidcAdapter } from "../build/helpers/oidc/store.js";
import { hashSecret, opaqueSubject, validateRedirect, randomToken, verifySecret } from "../build/helpers/oidc/security.js";
import { takeOidcContinuation } from "../build/helpers/oidc/continuation.js";
import CasRouter from "../build/helpers/routes/casRouter.js";
import CAS from "../build/helpers/cas.js";
import PersonModel from "../build/helpers/models/PersonModel.js";
import APIKeyModel from "../build/helpers/models/APIKeyModel.js";

// Only use an explicit test URL. Each run creates and drops its own isolated schema.
if (!process.env.OIDC_TEST_DATABASE_URL) throw new Error("Set OIDC_TEST_DATABASE_URL to a disposable PostgreSQL database");
const schema = `oidc_test_${randomBytes(8).toString("hex")}`;
const admin = new Sequelize(process.env.OIDC_TEST_DATABASE_URL, { logging: false });
const sql = new Sequelize(process.env.OIDC_TEST_DATABASE_URL, { logging: false, dialectOptions: { options: `-c search_path=${schema}` } });
const secret = randomToken();
const redirect = "http://localhost:3001/auth/yalies/callback";
let server, issuer, provider;
const frontend = "http://localhost:3000";

class Browser {
  cookies = new Map();
  casRequests = 0;
  async request(path, options = {}) {
    const url = new URL(path, issuer);
    if (url.pathname.replace(/\/$/, "") === API_ROUTES.login.replace(/\/$/, "")) this.casRequests++;
    assert.equal(url.origin, issuer, "test browser must not call external services");
    const cookie = [...this.cookies.values()].filter(c => url.pathname.startsWith(c.path)).map(c => c.value).join("; ");
    const response = await fetch(url, { ...options, redirect: "manual", headers: { ...options.headers, ...(cookie ? { cookie } : {}) } });
    for (const value of response.headers.getSetCookie()) {
      const parts = value.split(";").map(p => p.trim());
      const path = parts.find(p => /^path=/i.test(p))?.slice(5) || "/";
      const key = `${parts[0].split("=")[0]}:${path}`;
      if (parts.some(p => /^max-age=0$/i.test(p))) this.cookies.delete(key);
      else this.cookies.set(key, { path, value: parts[0] });
    }
    return response;
  }
}

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await sql.query(await readFile(new URL("../migrations/20260923_continue_with_yalies.sql", import.meta.url), "utf8"));
  PersonModel.initModel(sql);
  await PersonModel.sync(); // Test-only isolated schema, never production startup.
  await PersonModel.create({ id: 1, netid: "testnetid", first_name: "Test", preferred_name: "Tester", last_name: "Student", school: "Yale College" });
  APIKeyModel.initModel(sql);
  await APIKeyModel.sync();
  await APIKeyModel.create({ owner_netid: "testnetid", key: "legacy-test-api-key", description: "test", created_on: new Date(), uses_count: 0 });
  Object.assign(process.env, { NODE_ENV: "development", OIDC_ENABLED: "true", FRONTEND_URL: frontend, OIDC_SUBJECT_SECRET: randomToken(), OIDC_COOKIE_KEYS: JSON.stringify([randomToken()]) });
  const app = express();
  const legacyCors = cors({ credentials: true, origin: true });
  app.use((req, res, next) => isOidcPath(req.path) ? next() : legacyCors(req, res, next));
  const json = express.json(), form = express.urlencoded({ extended: true });
  app.use((req, res, next) => isOidcProtocolPath(req.path) ? next() : json(req, res, next));
  app.use((req, res, next) => isOidcPath(req.path) ? next() : form(req, res, next));
  app.use(session({ secret: randomToken(), resave: false, saveUninitialized: false }));
  new CAS();
  // Exercise the actual CasRouter through Passport, including its session regeneration.
  // Only the external CAS ticket validation is replaced. No real Yale credentials are used.
  passport.use("cas", {
    name: "cas",
    authenticate(req) {
      if (req.query.ticket === "test-ticket") this.success({ netId: "testnetid" });
      else this.redirect(`${API_ROUTES.login}?ticket=test-ticket`);
    },
  });
  app.use(passport.initialize());
  app.use(passport.session());
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  issuer = `http://localhost:${server.address().port}`;
  process.env.OIDC_ISSUER = issuer;
  provider = mountOidc(app, sql);
  app.use(API_ROUTES.login, new CasRouter().getRouter());
  app.get("/legacy-api", CAS.requireAuthentication, (_req, res) => res.json({ ok: true }));
  app.get("/session-only", CAS.requireAuthenticationSessionOnly, (_req, res) => res.json({ ok: true }));
  await OAuthClient.create({ client_id: "yuttler", display_name: "Yuttler", redirect_uris: [redirect], scopes: ["openid", "profile"], active: true, development: true, confidential: true, secret_hash: await hashSecret(secret) });
});

after(async () => {
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await sql.close();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.close();
});

function authParams(overrides = {}) {
  const verifier = randomToken();
  const params = { client_id: "yuttler", redirect_uri: redirect, response_type: "code", scope: "openid profile", state: randomToken(), nonce: randomToken(), code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", ...overrides };
  for (const key of Object.keys(params)) if (params[key] === undefined) delete params[key];
  return { verifier, params };
}

async function start(browser = new Browser(), overrides = {}) {
  const flow = authParams(overrides);
  const response = await browser.request(`/oauth/authorize?${new URLSearchParams(flow.params)}`);
  return { ...flow, response, browser };
}

async function consent(browser = new Browser(), overrides = {}) {
  const flow = await start(browser, overrides);
  assert.equal(flow.response.status, 303);
  const interactionPath = flow.response.headers.get("location");
  assert.match(interactionPath, /\/oauth\/interaction\//);
  let response = await browser.request(interactionPath);
  if (response.headers.get("location") === API_ROUTES.login) {
    response = await browser.request(API_ROUTES.login);
    response = await browser.request(response.headers.get("location"));
    assert.equal(response.headers.get("location"), interactionPath, "CAS must resume the same interaction after session regeneration");
    response = await browser.request(interactionPath);
  }
  assert.match(response.headers.get("location"), /^http:\/\/localhost:3000\/connect\?interaction=/);
  response = await browser.request(`${interactionPath}/details`, { headers: { origin: frontend } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(Object.keys(data.person).sort(), ["name", "school"]);
  return { ...flow, interactionPath, data };
}

async function finish(flow, action = "continue", overrides = {}) {
  let response = await flow.browser.request(flow.interactionPath, { method: "POST", headers: { origin: frontend, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: flow.data.csrf, action, ...overrides }) });
  assert.equal(response.status, 303);
  response = await flow.browser.request(response.headers.get("location"));
  assert.equal(response.status, 303);
  return new URL(response.headers.get("location"));
}

async function exchange(code, verifier, suppliedSecret = secret) {
  return fetch(`${issuer}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`yuttler:${suppliedSecret}`).toString("base64")}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier }) });
}

test("discovery advertises only narrow code flow, S256, RS256 keys", async () => {
  const metadata = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json();
  assert.equal(metadata.issuer, issuer);
  assert.deepEqual(metadata.response_types_supported, ["code"]);
  assert.deepEqual(metadata.grant_types_supported, ["authorization_code"]);
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  assert.equal(metadata.authorization_endpoint, `${issuer}/oauth/authorize`);
  assert.equal(metadata.registration_endpoint, undefined);
  const keys = await (await fetch(metadata.jwks_uri)).json();
  assert.ok(keys.keys.length);
  assert.ok(keys.keys.every(k => !k.d));
});

test("valid client survives CAS, signs minimal claims, and preserves legacy session auth", async () => {
  const flow = await consent();
  const callback = await finish(flow);
  assert.equal(callback.origin + callback.pathname, redirect);
  assert.equal(callback.searchParams.get("state"), flow.params.state);
  const response = await exchange(callback.searchParams.get("code"), flow.verifier);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal(tokens.refresh_token, undefined);
  const jwks = await (await fetch(`${issuer}/oauth/jwks`)).json();
  const { payload } = await jwtVerify(tokens.id_token, createLocalJWKSet(jwks), { issuer, audience: "yuttler", algorithms: ["RS256"] });
  assert.equal(payload.nonce, flow.params.nonce);
  assert.equal(payload.name, "Tester Student");
  assert.equal(payload.sub, opaqueSubject(process.env.OIDC_SUBJECT_SECRET, "testnetid", "yuttler"));
  assert.ok(!JSON.stringify(payload).includes("testnetid"));
  assert.ok(Object.keys(payload).every(k => ["sub", "name", "iss", "aud", "exp", "iat", "nonce", "auth_time", "at_hash", "sid"].includes(k)));
  const info = await (await fetch(`${issuer}/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } })).json();
  assert.deepEqual(info, { sub: payload.sub, name: "Tester Student" });
  assert.equal((await flow.browser.request("/legacy-api")).status, 200);
  assert.equal((await new Browser().request("/legacy-api")).status, 401);
  assert.equal((await new Browser().request("/legacy-api", { headers: { authorization: "Bearer legacy-test-api-key" } })).status, 200);
  assert.equal((await flow.browser.request("/legacy-api", { headers: { authorization: `Bearer ${tokens.access_token}` } })).status, 401);
  assert.equal((await flow.browser.request("/session-only", { headers: { authorization: `Bearer ${tokens.access_token}` } })).status, 403);
  assert.equal((await new Browser().request(`${flow.interactionPath}/details`)).status, 410);
  const casRequests = flow.browser.casRequests;
  const next = await consent(flow.browser);
  assert.equal(next.data.client.name, "Yuttler", "existing session still requires consent without CAS");
  assert.equal(flow.browser.casRequests, casRequests);
});

test("normal CAS login still returns home; provider cookies alone cannot bypass Yalies login", async () => {
  const browser = new Browser();
  const normal = await browser.request(`${API_ROUTES.login}?ticket=test-ticket`);
  assert.equal(normal.headers.get("location"), `${frontend}/`);
  const flow = await consent(browser);
  await finish(flow);
  for (const key of browser.cookies.keys()) if (key.startsWith("connect.sid:")) browser.cookies.delete(key);
  const next = await start(browser);
  const response = await browser.request(next.response.headers.get("location"));
  assert.equal(response.headers.get("location"), API_ROUTES.login);
});

test("approved public clients still require PKCE and can exchange without a secret", async () => {
  await OAuthClient.create({ client_id: "public-test", display_name: "Public test", redirect_uris: [redirect], scopes: ["openid"], active: true, development: true, confidential: false, secret_hash: null });
  const flow = await consent(undefined, { client_id: "public-test", scope: "openid" });
  const callback = await finish(flow);
  const response = await fetch(`${issuer}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: "public-test", grant_type: "authorization_code", code: callback.searchParams.get("code"), redirect_uri: redirect, code_verifier: flow.verifier }) });
  assert.equal(response.status, 200);
  const missingPkce = await start(undefined, { client_id: "public-test", scope: "openid", code_challenge: undefined, code_challenge_method: undefined });
  assert.ok(missingPkce.response.headers.get("location")?.includes("error="));
});

for (const [label, override] of [
  ["unknown client", { client_id: "unknown" }],
  ["altered redirect", { redirect_uri: `${redirect}/extra` }],
  ["lookalike redirect", { redirect_uri: "http://localhost.attacker.test:3001/auth/yalies/callback" }],
  ["wildcard redirect", { redirect_uri: "http://localhost:3001/*" }],
  ["missing PKCE", { code_challenge: undefined, code_challenge_method: undefined }],
  ["plain PKCE", { code_challenge_method: "plain" }],
  ["implicit flow", { response_type: "id_token" }],
  ["missing state", { state: undefined }],
  ["missing nonce", { nonce: undefined }],
  ["OAuth without openid", { scope: "profile" }],
  ["unsupported freshness promise", { max_age: "0" }],
  ["fragment response mode", { response_mode: "fragment" }],
]) test(`${label} fails before interaction`, async () => {
  const { response } = await start(undefined, override);
  const location = response.headers.get("location");
  assert.ok(response.status >= 400 || location?.includes("error="));
  assert.ok(!location?.includes("/oauth/interaction/"));
});

test("invalid verifier and incorrect confidential secret fail", async () => {
  const flow = await consent();
  const callback = await finish(flow);
  const code = callback.searchParams.get("code");
  assert.equal((await exchange(code, flow.verifier, "incorrect-secret")).status, 401);
  const response = await exchange(code, randomToken());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_grant");
});

test("authorization code is single use, including simultaneous exchanges", async () => {
  const flow = await consent();
  const callback = await finish(flow);
  const code = callback.searchParams.get("code");
  const responses = await Promise.all([exchange(code, flow.verifier), exchange(code, flow.verifier)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  assert.equal((await exchange(code, flow.verifier)).status, 400);
});

test("expired authorization code fails", async () => {
  const flow = await consent();
  const callback = await finish(flow);
  await sql.query("UPDATE oauth_artifact SET expires_at = NOW() - INTERVAL '1 minute' WHERE kind = 'AuthorizationCode'");
  assert.equal((await exchange(callback.searchParams.get("code"), flow.verifier)).status, 400);
});

test("Cancel returns access_denied with original state", async () => {
  const flow = await consent();
  const callback = await finish(flow, "cancel");
  assert.equal(callback.searchParams.get("error"), "access_denied");
  assert.equal(callback.searchParams.get("state"), flow.params.state);
  assert.equal(callback.searchParams.get("code"), null);
});

test("CSRF and foreign origins cannot consent or read details", async () => {
  const flow = await consent();
  for (const [origin, csrf] of [[frontend, "bad-token"], ["https://evil.test", flow.data.csrf]]) {
    const response = await flow.browser.request(flow.interactionPath, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ action: "continue", csrf }) });
    assert.match(response.headers.get("location"), /connect\?error=/);
  }
  const response = await flow.browser.request(`${flow.interactionPath}/details`, { headers: { origin: "https://evil.test" } });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const mixedCase = await flow.browser.request(`${flow.interactionPath.replace("/oauth/", "/OAuth/")}/details`, { headers: { origin: "https://evil.test" } });
  assert.equal(mixedCase.headers.get("access-control-allow-origin"), null);
});

test("inactive client rejected immediately even after being cached", async () => {
  const flow = await consent();
  const callback = await finish(flow);
  await OAuthClient.update({ active: false }, { where: { client_id: "yuttler" } });
  try {
    const { response } = await start();
    assert.equal(response.status, 400);
    assert.equal((await exchange(callback.searchParams.get("code"), flow.verifier)).status, 401);
  } finally { await OAuthClient.update({ active: true }, { where: { client_id: "yuttler" } }); }
});

test("openid alone omits profile; opaque subjects stable and client-specific", async () => {
  const flow = await consent(undefined, { scope: "openid" });
  assert.deepEqual(flow.data.permissions, ["Your Yalies identity"]);
  const callback = await finish(flow);
  const tokens = await (await exchange(callback.searchParams.get("code"), flow.verifier)).json();
  const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url"));
  assert.equal(payload.name, undefined);
  assert.notEqual(payload.sub, opaqueSubject(process.env.OIDC_SUBJECT_SECRET, "testnetid", "other"));
});

test("adapter persists across instances, preserves consumption, and revokes grants", async () => {
  const a = new SequelizeOidcAdapter("AuthorizationCode"), b = new SequelizeOidcAdapter("AuthorizationCode");
  await a.upsert("adapter-test", { grantId: "grant-test", uid: "uid-test" }, 60);
  assert.equal((await b.find("adapter-test")).grantId, "grant-test");
  await b.consume("adapter-test");
  await a.upsert("adapter-test", { grantId: "grant-test" }, 60);
  assert.ok((await b.find("adapter-test")).consumed);
  await assert.rejects(() => a.consume("adapter-test"));
  await a.revokeByGrantId("grant-test");
  assert.equal(await b.find("adapter-test"), undefined);
});

test("registration and CAS continuation validation reject unsafe inputs", () => {
  for (const uri of ["https://*.example.com/cb", "http://example.com/cb", "https://example.com/cb#fragment", "https://user:pass@example.com/cb"]) assert.throws(() => validateRedirect(uri, false));
  assert.doesNotThrow(() => validateRedirect(redirect, true));
  assert.throws(() => validateRedirect(redirect, false));
  assert.equal(takeOidcContinuation({ session: { oidcContinuation: { uid: "https://evil.test", expires: Date.now() + 10000 } } }), undefined);
  assert.equal(takeOidcContinuation({ session: { oidcContinuation: { uid: randomToken(), expires: 1 } } }), undefined);
});

test("registration CLI seeds only hashed secrets and refuses accidental replacement", async () => {
  const database = new URL(process.env.OIDC_TEST_DATABASE_URL);
  database.searchParams.set("options", `-c search_path=${schema}`);
  const seedSecret = randomToken();
  const options = { env: { ...process.env, DATABASE_URL: database.href, OIDC_CLIENT_ID: "seeded-test", OIDC_CLIENT_SECRET: seedSecret } };
  const run = promisify(execFile);
  const args = ["scripts/register-oidc-client.mjs", "--development"];
  const output = await run(process.execPath, args, options);
  assert.ok(!output.stdout.includes(seedSecret));
  const record = await OAuthClient.findByPk("seeded-test");
  assert.ok(record);
  assert.notEqual(record.secret_hash, seedSecret);
  assert.equal(await verifySecret(seedSecret, record.secret_hash), true);
  assert.deepEqual(record.redirect_uris, [redirect]);
  await assert.rejects(() => run(process.execPath, args, options));
});
