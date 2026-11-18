import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { getYaleMojiAvatar, getYaleMojiAvatars, withYaleMojiAvatars } from "../build/helpers/yalemojiAvatar.js";

const originalEnv = { ...process.env };
const avatar = {
  version: 3,
  png_url: "https://storage.googleapis.com/assets/opaque/3/avatar.png",
  svg_url: "https://storage.googleapis.com/assets/opaque/3/avatar.svg",
  background_url: "https://storage.googleapis.com/assets/opaque/3/background.svg",
};
afterEach(() => {
  mock.restoreAll();
  process.env = { ...originalEnv };
});
function respond(body, status = 200) {
  process.env.YALEMOJI_API_KEY = "test-server-only-key";
  delete process.env.YALEMOJI_API_URL;
  mock.method(console, "warn", () => {});
  return mock.method(globalThis, "fetch", async () => Response.json(body, { status }));
}

test("looks up the signed-in NetID using a server-only bearer key and returns only asset fields", async () => {
  const fetch = respond({ netid: "abc123", avatar: { ...avatar, private_data: "hidden" } });
  assert.deepEqual(await getYaleMojiAvatar("ABC123"), avatar);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(String(url), "https://www.yalemoji.com/api/v1/users/abc123");
  assert.deepEqual(options.headers, { Authorization: "Bearer test-server-only-key" });
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
});

test("no configured key or invalid NetID skips the lookup", async () => {
  const fetch = respond({ avatar });
  assert.equal(await getYaleMojiAvatar("../someone"), undefined);
  delete process.env.YALEMOJI_API_KEY;
  assert.equal(await getYaleMojiAvatar("abc123"), undefined);
  assert.equal(fetch.mock.callCount(), 0);
});

test("missing avatars fall back and a later saved avatar can be discovered", async () => {
  const fetch = respond({ error: "not_found" }, 404);
  assert.equal(await getYaleMojiAvatar("abc123"), null);
  fetch.mock.mockImplementation(async () => Response.json({ avatar }));
  assert.deepEqual(await getYaleMojiAvatar("abc123"), avatar);
});

test("auth errors, rate limits and service failures do not break the profile", async () => {
  const fetch = respond({});
  for (const status of [401, 429, 503]) {
    fetch.mock.mockImplementation(async () => Response.json({ error: "unavailable" }, { status }));
    assert.equal(await getYaleMojiAvatar("abc123"), undefined);
  }
  fetch.mock.mockImplementation(async () => { throw new DOMException("Timed out", "TimeoutError"); });
  assert.equal(await getYaleMojiAvatar("abc123"), undefined);
});

test("rejects malformed avatars and unsafe asset URLs", async () => {
  const fetch = respond({});
  for (const invalid of [null, {}, { ...avatar, version: 0 }, { ...avatar, png_url: "javascript:alert(1)" }, { ...avatar, background_url: "http://cdn/background.svg" }]) {
    fetch.mock.mockImplementation(async () => Response.json({ avatar: invalid }));
    assert.equal(await getYaleMojiAvatar("abc123"), undefined);
  }
});

test("permits a local Yalemoji server in development and refuses insecure remote endpoints", async () => {
  const fetch = respond({ avatar });
  process.env.NODE_ENV = "development";
  process.env.YALEMOJI_API_URL = "http://localhost:3002";
  assert.deepEqual(await getYaleMojiAvatar("abc123"), avatar);
  assert.equal(String(fetch.mock.calls[0].arguments[0]), "http://localhost:3002/api/v1/users/abc123");
  process.env.YALEMOJI_API_URL = "http://yalemoji.com";
  assert.equal(await getYaleMojiAvatar("abc123"), undefined);
  process.env.NODE_ENV = "production";
  process.env.YALEMOJI_API_URL = "http://localhost:3002";
  assert.equal(await getYaleMojiAvatar("abc123"), undefined);
  assert.equal(fetch.mock.callCount(), 1);
});


test("batch lookup deduplicates valid NetIDs and returns only requested public assets", async () => {
  const fetch = respond({ users: { abc123: { ...avatar, private_data: "hidden" }, zz99: null, other: avatar } });
  const result = await getYaleMojiAvatars(["ABC123", " abc123 ", "zz99", "../someone"]);
  assert.deepEqual([...result], [["abc123", avatar], ["zz99", null]]);
  assert.equal(fetch.mock.callCount(), 1);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(String(url), "https://www.yalemoji.com/api/v1/lookup");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer test-server-only-key");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), { netids: ["abc123", "zz99"] });
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
});

test("batch lookup respects the 100-NetID limit and skips empty or unconfigured lookups", async () => {
  const fetch = respond({ users: {} });
  await getYaleMojiAvatars([]);
  await getYaleMojiAvatars(["invalid!"]);
  assert.equal(fetch.mock.callCount(), 0);
  await getYaleMojiAvatars(Array.from({ length: 101 }, (_, i) => `u${i}`));
  assert.deepEqual(fetch.mock.calls.map(call => JSON.parse(call.arguments[1].body).netids.length), [100, 1]);
  delete process.env.YALEMOJI_API_KEY;
  await getYaleMojiAvatars(["abc123"]);
  assert.equal(fetch.mock.callCount(), 2);
});

test("batch errors, timeouts, omitted users and malformed assets preserve search results", async () => {
  const people = [{ netid: "abc123", first_name: "Alex", last_name: "Morgan", image: "https://photo.example/a.jpg" }];
  const fetch = respond({ users: {} });
  const missing = [{ ...people[0], yalemoji: null }];
  for (const body of [{}, { users: null }, { users: [] }, { users: {} }, { users: { abc123: { ...avatar, png_url: "javascript:alert(1)" } } }]) {
    fetch.mock.mockImplementation(async () => Response.json(body));
    assert.deepEqual(await withYaleMojiAvatars(people), missing);
  }
  for (const status of [401, 429, 503]) {
    fetch.mock.mockImplementation(async () => Response.json({}, { status }));
    assert.deepEqual(await withYaleMojiAvatars(people), missing);
  }
  fetch.mock.mockImplementation(async () => { throw new DOMException("Timed out", "TimeoutError"); });
  assert.deepEqual(await withYaleMojiAvatars(people), missing);
  fetch.mock.mockImplementation(async () => Response.json({ users: { abc123: avatar } }));
  assert.deepEqual(await withYaleMojiAvatars(people), [{ ...people[0], yalemoji: avatar }]);
  assert.equal(people[0].yalemoji, undefined);
});

test("enriches every search result, including people without photos or NetIDs, and refreshes reused rows", async () => {
  const people = [
    { netid: "ABC123", first_name: "Alex", last_name: "Morgan" },
    { netid: "zz99", first_name: "Sam", last_name: "Rivera", image: "https://photo.example/s.jpg" },
    { first_name: "Taylor", last_name: "Patel" },
  ];
  const fetch = respond({ users: { abc123: avatar, zz99: null } });
  assert.deepEqual(await withYaleMojiAvatars(people), [
    { ...people[0], yalemoji: avatar }, { ...people[1], yalemoji: null }, { ...people[2], yalemoji: null },
  ]);
  fetch.mock.mockImplementation(async () => Response.json({ users: { abc123: null, zz99: avatar } }));
  assert.deepEqual(await withYaleMojiAvatars(people), [
    { ...people[0], yalemoji: null }, { ...people[1], yalemoji: avatar }, { ...people[2], yalemoji: null },
  ]);
  assert.equal(fetch.mock.callCount(), 2);
  assert.ok(people.every(person => person.yalemoji === undefined));
});
