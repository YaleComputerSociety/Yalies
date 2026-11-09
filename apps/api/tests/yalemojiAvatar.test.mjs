import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { getYaleMojiAvatar } from "../build/helpers/yalemojiAvatar.js";

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
  assert.equal(await getYaleMojiAvatar("../someone"), null);
  delete process.env.YALEMOJI_API_KEY;
  assert.equal(await getYaleMojiAvatar("abc123"), null);
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
    assert.equal(await getYaleMojiAvatar("abc123"), null);
  }
  fetch.mock.mockImplementation(async () => { throw new DOMException("Timed out", "TimeoutError"); });
  assert.equal(await getYaleMojiAvatar("abc123"), null);
});

test("rejects malformed avatars and unsafe asset URLs", async () => {
  const fetch = respond({});
  for (const invalid of [null, {}, { ...avatar, version: 0 }, { ...avatar, png_url: "javascript:alert(1)" }, { ...avatar, background_url: "http://cdn/background.svg" }]) {
    fetch.mock.mockImplementation(async () => Response.json({ avatar: invalid }));
    assert.equal(await getYaleMojiAvatar("abc123"), null);
  }
});

test("permits a local YaleMoji server in development and refuses insecure remote endpoints", async () => {
  const fetch = respond({ avatar });
  process.env.NODE_ENV = "development";
  process.env.YALEMOJI_API_URL = "http://localhost:3002";
  assert.deepEqual(await getYaleMojiAvatar("abc123"), avatar);
  assert.equal(String(fetch.mock.calls[0].arguments[0]), "http://localhost:3002/api/v1/users/abc123");
  process.env.YALEMOJI_API_URL = "http://yalemoji.com";
  assert.equal(await getYaleMojiAvatar("abc123"), null);
  process.env.NODE_ENV = "production";
  process.env.YALEMOJI_API_URL = "http://localhost:3002";
  assert.equal(await getYaleMojiAvatar("abc123"), null);
  assert.equal(fetch.mock.callCount(), 1);
});
