import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Sequelize } from "sequelize";
import UserProfileModel from "../build/helpers/models/UserProfileModel.js";
import PersonModel from "../build/helpers/models/PersonModel.js";
import ProfileLikeModel from "../build/helpers/models/ProfileLikeModel.js";
import UserProfileRouter from "../build/helpers/routes/userProfileRouter.js";
import PeopleRouter, { invalidateSearchCache } from "../build/helpers/routes/peopleRouter.js";

const sql = new Sequelize("postgres://test:test@localhost/test", { logging: false });
UserProfileModel.initModel(sql);
const originalKey = process.env.YALEMOJI_API_KEY;
afterEach(() => {
  mock.restoreAll();
  if(originalKey === undefined) delete process.env.YALEMOJI_API_KEY;
  else process.env.YALEMOJI_API_KEY = originalKey;
  invalidateSearchCache("visibility-viewer");
});
function response() {
  return { code: 200, body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

test("profiles default to visible and serialize an explicit opt-out", () => {
  assert.equal(UserProfileModel.build({ netid: "me1" }).toSanitizedObject().show_yalemoji, true);
  assert.equal(UserProfileModel.build({ netid: "me1", show_yalemoji: false }).toSanitizedObject().show_yalemoji, false);
});

test("saving visibility persists both values and unrelated edits preserve the opt-out", async () => {
  let stored = { netid: "me1", show_yalemoji: false };
  // Exercise Sequelize's actual upsert field selection without a database connection.
  const query = mock.method(sql.getQueryInterface(), "upsert", async (_table, insert, update) => {
    stored = { ...stored, ...update };
    return [UserProfileModel.build(stored), false];
  });
  const router = new UserProfileRouter();
  for(const body of [{ instagram_url: null }, { show_yalemoji: true }, { show_yalemoji: false }]) {
    const res = response();
    await router.updateMyProfile({ netid: "me1", body }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.show_yalemoji, body.show_yalemoji ?? false);
  }
  assert.equal(query.mock.callCount(), 3);
  for(const value of [null, "false", 0, {}, []]) {
    const res = response();
    await router.updateMyProfile({ netid: "me1", body: { show_yalemoji: value } }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(query.mock.callCount(), 3);
});

test("cached searches refresh visibility after opt-out, opt-in and profile deletion while retaining avatars", async () => {
  process.env.YALEMOJI_API_KEY = "test-key";
  const avatar = {
    version: 1,
    png_url: "https://example.com/avatar.png",
    svg_url: "https://example.com/avatar.svg",
    background_url: "https://example.com/background.svg",
  };
  mock.method(globalThis, "fetch", async () => Response.json({ users: { target1: avatar } }));
  const directory = { netid: "target1", first_name: "Target", last_name: "Test" };
  const people = mock.method(PersonModel, "findAll", async () => [{ ...directory, toSanitizedObject: () => directory }]);
  let profiles = [];
  mock.method(UserProfileModel, "findAll", async () => profiles);
  mock.method(ProfileLikeModel, "findAll", async () => []);
  const router = new PeopleRouter();
  const req = { body: {}, headers: { authorization: "test" }, netid: "visibility-viewer" };
  const search = async () => {
    const res = response();
    await router.getPeople(req, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body[0].yalemoji, avatar);
    return res.body[0];
  };
  assert.equal((await search()).user_profile, undefined);
  for(const visible of [false, true, false]) {
    profiles = [UserProfileModel.build({ netid: "target1", show_yalemoji: visible })];
    assert.equal((await search()).user_profile.show_yalemoji, visible);
  }
  profiles = [];
  assert.equal((await search()).user_profile, undefined);
  assert.equal(people.mock.callCount(), 1, "directory results should still come from cache");
});
