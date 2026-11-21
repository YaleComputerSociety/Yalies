import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Sequelize } from "sequelize";
import express from "express";
import { DISCOVERY_FIELDS, DISCOVERY_OPTIONS, discoveryProfileHandled, discoveryFieldsCompleted } from "yalies-shared";
import { parseDiscoveryUpdate, DISCOVERY_SETUP_SQL } from "../build/helpers/discoveryProfile.js";
import DiscoveryProfileModel from "../build/helpers/models/DiscoveryProfileModel.js";
import UserProfileModel from "../build/helpers/models/UserProfileModel.js";
import UserProfileRouter from "../build/helpers/routes/userProfileRouter.js";
import { RECENTS_SETUP_SQL } from "../build/helpers/db.js";

const sql = new Sequelize("postgres://test:test@localhost/test", { logging: false });
DiscoveryProfileModel.initModel(sql);
UserProfileModel.initModel(sql);
afterEach(() => mock.restoreAll());
function response() {
  return { code: 200, body: undefined, headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("every category accepts only named options; blank, null, unknown and injected fields are rejected", () => {
  for(const field of DISCOVERY_FIELDS) {
    for(const option of DISCOVERY_OPTIONS[field].options) assert.deepEqual(parseDiscoveryUpdate({ [field]: field === "race" ? [option] : option }), { [field]: field === "race" ? [option] : option });
    for(const value of [null, "", " ", ...(field === "race" ? [] : [[]]), 0, false, "invalid"]) assert.throws(() => parseDiscoveryUpdate({ [field]: value }));
  }
  for(const body of [null, [], {}, { netid: "victim" }, { gender: "Female", admin: true }]) assert.throws(() => parseDiscoveryUpdate(body));
  assert.equal(discoveryFieldsCompleted({ gender: "Female", sexuality: null, religion: "invalid", race: ["White"] }), 2);
});

test("private answers are absent from public profile serialization", () => {
  const publicProfile = UserProfileModel.build({ netid: "me1", gender: "Female", race: ["Asian"] }).toSanitizedObject();
  for(const field of DISCOVERY_FIELDS) assert.equal(field in publicProfile, false);
  assert.deepEqual(DiscoveryProfileModel.build({ netid: "me1", gender: "Female" }).toPrivateObject(), { gender: "Female" });
});

test("partial upserts preserve saved fields and always use the session NetID", async () => {
  let saved = { netid: "me1", gender: "Female" };
  const upsert = mock.method(sql.getQueryInterface(), "upsert", async (_table, insert, update) => {
    saved = { ...saved, ...update };
    return [DiscoveryProfileModel.build(saved), false];
  });
  const router = new UserProfileRouter();
  for(const body of [{ race: ["Asian"] }, { gender: "Male" }, { gender: "Male" }]) {
    const res = response();
    await router.updateMyDiscoveryProfile({ netid: "me1", body }, res);
    assert.equal(res.code, 200);
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
  assert.deepEqual(saved.gender, "Male");
  assert.deepEqual(saved.race, ["Asian"]);
  assert.equal(saved.netid, "me1");
  for(const body of [{ gender: null }, { race: "" }, { netid: "victim", gender: "Female" }]) {
    const res = response();
    await router.updateMyDiscoveryProfile({ netid: "me1", body }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(upsert.mock.callCount(), 3);
});

test("stats never query recents for incomplete profiles, regardless of client-supplied fields or NetID", async () => {
  const router = new UserProfileRouter();
  mock.method(UserProfileModel, "findByPk", async () => UserProfileModel.build({ show_yalemoji: false }));
  const find = mock.method(DiscoveryProfileModel, "findByPk", async () => null);
  const query = mock.method(sql, "query", async () => { throw new Error("Must not query recents"); });
  for(const profile of [null, {}, { gender: "Female" }]) {
    find.mock.mockImplementation(async netid => {
      assert.equal(netid, "me1");
      return profile ? DiscoveryProfileModel.build(profile) : null;
    });
    const res = response();
    await router.getMyDiscoveryStats({ netid: "me1", query: { netid: "victim", gender: "Female", race: ["White"] } }, res);
    assert.equal(res.code, 403);
    assert.equal(res.body.searches_this_week, undefined);
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
  assert.equal(query.mock.callCount(), 0);
});

test("unlocked stats bind only the owner and return an aggregate", async () => {
  mock.method(UserProfileModel, "findByPk", async () => null);
  mock.method(DiscoveryProfileModel, "findByPk", async () => DiscoveryProfileModel.build({ gender: "Female", sexuality: "Bi", race: ["Asian"] }));
  const query = mock.method(sql, "query", async () => [{ searches_this_week: "5", netid: "secret" }]);
  const res = response();
  await new UserProfileRouter().getMyDiscoveryStats({ netid: "me1", query: { netid: "victim" } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { searches_this_week: 5 });
  assert.deepEqual(query.mock.calls[0].arguments[1].bind, { netid: "me1" });
});

test("discovery endpoints reject anonymous and API-key-only requests", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.isAuthenticated = () => false; next(); });
  app.use(new UserProfileRouter().getRouter());
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    for(const path of ["/me/setup", "/me/discovery", "/me/discovery/stats"]) {
      for(const headers of [{}, { Authorization: "Bearer not-a-session" }]) {
        const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers });
        assert.equal(res.status, headers.Authorization ? 403 : 401);
      }
    }
    const res = await fetch(`http://127.0.0.1:${server.address().port}/me/discovery`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"gender":"Female"}' });
    assert.equal(res.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("PostgreSQL enforces sticky choices and counts only the owner's appearances in the last seven days", { skip: !process.env.DISCOVERY_TEST_DATABASE_URL }, async () => {
  const schema = `discovery_test_${randomBytes(8).toString("hex")}`;
  const admin = new Sequelize(process.env.DISCOVERY_TEST_DATABASE_URL, { logging: false });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new Sequelize(process.env.DISCOVERY_TEST_DATABASE_URL, { logging: false, dialectOptions: { options: `-c search_path=${schema},public` } });
  try {
    // Start from the original choices and check constraints, as on an existing installation.
    await db.query(`CREATE TABLE discovery_profile (
      netid VARCHAR(255) PRIMARY KEY,
      gender TEXT CHECK (gender IN ('Woman', 'Man', 'Nonbinary', 'Another identity')),
      sexuality TEXT CHECK (sexuality IN ('Bisexual', 'Pansexual')),
      religion TEXT CHECK (religion IN ('Another religion', 'Buddhist', 'Sikh', 'Spiritual', 'Agnostic', 'Atheist', 'Hindu')),
      race TEXT CHECK (race IN ('Hispanic or Latino', 'Middle Eastern or North African')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO discovery_profile (netid, gender, sexuality, religion, race) VALUES
      ('legacy1', 'Woman', 'Bisexual', 'Another religion', 'Hispanic or Latino'),
      ('legacy2', 'Nonbinary', 'Pansexual', 'Buddhist', 'Middle Eastern or North African'),
      ('legacy3', NULL, NULL, 'Sikh', NULL), ('legacy4', NULL, NULL, 'Spiritual', NULL), ('legacy5', NULL, NULL, 'Agnostic', NULL), ('legacy6', NULL, NULL, 'Atheist', NULL), ('legacy7', NULL, NULL, 'Hindu', NULL)`);
    await db.query(DISCOVERY_SETUP_SQL);
    await db.query(DISCOVERY_SETUP_SQL); // Startup is idempotent.
    await db.query(RECENTS_SETUP_SQL);
    DiscoveryProfileModel.initModel(db);
    UserProfileModel.initModel(db);
    await db.query(`CREATE TABLE user_profile (
      netid VARCHAR(255) PRIMARY KEY, show_yalemoji BOOLEAN NOT NULL DEFAULT TRUE,
      description TEXT, interests TEXT[], linkedin_url VARCHAR(255), instagram_url VARCHAR(255),
      classes TEXT[], updated_at TIMESTAMP
    )`);
    await UserProfileModel.create({ netid: "owner", show_yalemoji: false });
    assert.deepEqual((await DiscoveryProfileModel.findByPk("legacy1")).toPrivateObject(), { gender: "Female", sexuality: "Bi", religion: "Other", race: ["Latino"] });
    for(const netid of ["legacy3", "legacy4"]) assert.equal((await DiscoveryProfileModel.findByPk(netid)).religion, "Other");
    for(const netid of ["legacy5", "legacy6"]) assert.equal((await DiscoveryProfileModel.findByPk(netid)).religion, "None");
    assert.equal((await DiscoveryProfileModel.findByPk("legacy7")).religion, "Other");
    const consolidated = (await DiscoveryProfileModel.findByPk("legacy2")).toPrivateObject();
    assert.deepEqual(consolidated, { gender: "Nonbinary", sexuality: "Other", religion: "Other", race: ["Other"] });
    assert.equal(discoveryFieldsCompleted(consolidated), 4);
    const router = new UserProfileRouter();
    const call = async (method, body = {}) => {
      const res = response();
      await router[method]({ netid: "owner", body }, res);
      return res;
    };
    assert.equal((await call("getMyDiscoveryStats")).code, 403);
    await call("updateMyDiscoveryProfile", { gender: "Female" });
    assert.equal((await call("getMyDiscoveryStats")).code, 403);
    await call("updateMyDiscoveryProfile", { race: ["Asian"], sexuality: "Bi", religion: "None" });
    await db.query(`INSERT INTO recents (netid, query, results, timestamp) VALUES
      ('other', 'query', ARRAY['owner', 'owner'], NOW()),
      ('other2', 'query', ARRAY['owner'], NOW() - INTERVAL '6 days'),
      ('owner', 'self', ARRAY['owner'], NOW()),
      ('old', 'query', ARRAY['owner'], NOW() - INTERVAL '8 days'),
      ('unrelated', 'query', ARRAY['someoneelse'], NOW())`);
    const stats = await call("getMyDiscoveryStats");
    assert.equal(stats.code, 200);
    assert.deepEqual(stats.body, { searches_this_week: 2 });
    for(const field of ["gender"]) {
      await assert.rejects(db.query(`UPDATE discovery_profile SET ${field} = NULL WHERE netid = 'owner'`), /cannot be cleared/);
      await assert.rejects(db.query(`UPDATE discovery_profile SET ${field} = '' WHERE netid = 'owner'`), /check constraint/);
    }
    assert.equal((await call("updateMyDiscoveryProfile", { gender: "Other" })).body.gender, "Other");
    assert.deepEqual((await call("getMyDiscoveryProfile")).body.race, ["Asian"]);
    assert.deepEqual((await call("updateMyDiscoveryProfile", { race: ["Asian", "Black"] })).body.race, ["Asian", "Black"]);
    assert.deepEqual((await call("updateMyDiscoveryProfile", { race: [] })).body.race, []);
    assert.equal((await call("getMyDiscoveryStats")).code, 403);
    const expandedChoices = (await call("updateMyDiscoveryProfile", { gender: "Nonbinary", race: ["East Asian", "Other Asian", "Asian"] })).body;
    assert.equal(expandedChoices.gender, "Nonbinary");
    assert.deepEqual(expandedChoices.race, ["East Asian", "Other Asian", "Asian"]);
    for(const field of DISCOVERY_FIELDS) {
      const skipped = await call("updateMyDiscoveryProfile", { skip: field });
      assert.equal(skipped.code, 200);
      assert.ok(skipped.body.skipped.includes(field));
    }
    const skippedProfile = (await call("getMyDiscoveryProfile")).body;
    assert.equal(skippedProfile.skipped.length, 4);
    assert.equal(discoveryFieldsCompleted(skippedProfile), 0);
    assert.equal(discoveryProfileHandled(skippedProfile), true);
    assert.equal(discoveryProfileHandled({ skipped: ["gender"] }), false);
    assert.equal((await call("getMyDiscoveryStats")).code, 403);
    const answered = (await call("updateMyDiscoveryProfile", { gender: "Male" })).body;
    assert.equal(answered.skipped.includes("gender"), false);
    assert.equal(answered.skipped.length, 3);
    assert.equal(discoveryFieldsCompleted(answered), 1);
    assert.equal(discoveryProfileHandled(answered), true);
    assert.equal((await call("updateMyDiscoveryProfile", { skip: "netid" })).code, 400);
  } finally {
    DiscoveryProfileModel.initModel(sql);
    UserProfileModel.initModel(sql);
    await db.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
  }
});

test("setup points count avatar, public visibility, and completed categories independently", async () => {
  const { accountSetupPoints } = await import("yalies-shared");
  assert.equal(accountSetupPoints(false, false, {}), 0);
  assert.equal(accountSetupPoints(false, true, {}), 1);
  assert.equal(accountSetupPoints(true, true, {}), 2);
  assert.equal(accountSetupPoints(true, false, {}), 1);
  assert.equal(accountSetupPoints(false, true, { gender: "Female" }), 2);
  assert.equal(accountSetupPoints(false, false, { race: ["White", "Asian", "Other"] }), 1);
  assert.equal(accountSetupPoints(false, true, { race: [] }), 1);
  assert.equal(accountSetupPoints(true, true, { gender: "Female", sexuality: "Bi", religion: "Jewish", race: ["White", "Asian"] }), 6);
});

test("setup endpoint uses saved answers and avatar status for the session owner", async () => {
  const originalKey = process.env.YALEMOJI_API_KEY;
  delete process.env.YALEMOJI_API_KEY;
  try {
    mock.method(UserProfileModel, "findByPk", async netid => { assert.equal(netid, "me1"); return UserProfileModel.build({ netid, show_yalemoji: false }); });
    mock.method(DiscoveryProfileModel, "findByPk", async netid => { assert.equal(netid, "me1"); return DiscoveryProfileModel.build({ netid, gender: "Male", race: ["Asian", "Black"] }); });
    const res = response();
    await new UserProfileRouter().getMySetup({ netid: "me1", query: { netid: "someoneelse", points: 6 } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.deepEqual(res.body, { points: 2, yalemoji_set: false, yalemoji_public: false, discovery_profile: { gender: "Male", race: ["Asian", "Black"] } });
  } finally {
    if(originalKey === undefined) delete process.env.YALEMOJI_API_KEY;
    else process.env.YALEMOJI_API_KEY = originalKey;
  }
});

test("an avatar service outage cannot misclassify an eligible avatar owner as needing creation", async () => {
  const originalKey = process.env.YALEMOJI_API_KEY;
  process.env.YALEMOJI_API_KEY = "test-key";
  try {
    mock.method(globalThis, "fetch", async () => Response.json({}, { status: 503 }));
    mock.method(console, "warn", () => {});
    mock.method(UserProfileModel, "findByPk", async () => null);
    mock.method(DiscoveryProfileModel, "findByPk", async () => null);
    const res = response();
    await new UserProfileRouter().getMySetup({ netid: "me1" }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.points, undefined);
  } finally {
    if(originalKey === undefined) delete process.env.YALEMOJI_API_KEY;
    else process.env.YALEMOJI_API_KEY = originalKey;
  }
});

test("discovery insights uses the account setup requirement, including public Yalemoji visibility", async () => {
  const originalKey = process.env.YALEMOJI_API_KEY;
  delete process.env.YALEMOJI_API_KEY;
  try {
    let isPublic = true;
    mock.method(UserProfileModel, "findByPk", async () => UserProfileModel.build({ show_yalemoji: isPublic }));
    mock.method(DiscoveryProfileModel, "findByPk", async () => DiscoveryProfileModel.build({ gender: "Female", sexuality: "Bi", religion: "None" }));
    const query = mock.method(sql, "query", async () => [{ searches_this_week: "3" }]);
    let res = response();
    await new UserProfileRouter().getMyDiscoveryStats({ netid: "me1" }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { searches_this_week: 3 });
    isPublic = false;
    res = response();
    await new UserProfileRouter().getMyDiscoveryStats({ netid: "me1" }, res);
    assert.equal(res.code, 403);
    assert.equal(query.mock.callCount(), 1);
  } finally {
    if(originalKey === undefined) delete process.env.YALEMOJI_API_KEY;
    else process.env.YALEMOJI_API_KEY = originalKey;
  }
});

test("finish-profile button requires over three points and every question answered or skipped", async () => {
  const { accountSetupFinished, ACCOUNT_SETUP_MIN_POINTS } = await import("yalies-shared");
  assert.equal(ACCOUNT_SETUP_MIN_POINTS, 4);
  const complete = { gender: "Female", sexuality: "Bi", religion: "None", skipped: ["race"] };
  assert.equal(accountSetupFinished({ points: 3, discovery_profile: complete }), false);
  assert.equal(accountSetupFinished({ points: 4, discovery_profile: complete }), true);
  assert.equal(accountSetupFinished({ points: 4, discovery_profile: { gender: "Female", sexuality: "Bi" } }), false);
  assert.equal(accountSetupFinished({ points: 1, discovery_profile: { skipped: DISCOVERY_FIELDS } }), false);
});
