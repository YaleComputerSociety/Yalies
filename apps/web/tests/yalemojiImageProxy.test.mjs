import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, mock, test } from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/app/api/yalemoji/avatar-image/route.ts", import.meta.url), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const asset = "https://storage.googleapis.com/yalemoji-avatars/avatars/public-id/3/avatar.png";
const request = url => new Request(`http://localhost/api/yalemoji/avatar-image?url=${encodeURIComponent(url)}`);
afterEach(() => mock.restoreAll());

test("only versioned public Yalemoji PNGs can be proxied", async () => {
	const fetch = mock.method(globalThis, "fetch", async () => { throw Error("Unexpected fetch"); });
	for(const url of ["http://127.0.0.1/private", "https://example.com/avatar.png", asset.replace("yalemoji-avatars", "private-bucket"), asset.replace("avatar.png", "background.svg"), asset + "?token=secret", asset.replace("https://", "https://user:pass@")]) {
		assert.equal((await GET(request(url))).status, 400);
	}
	assert.equal(fetch.mock.callCount(), 0);
});

test("returns PNG bytes with immutable caching, no forwarded credentials and no redirects", async () => {
	const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const fetch = mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "Content-Type": "image/png" } }));
	const response = await GET(request(asset));
	assert.equal(response.status, 200);
	assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
	assert.match(response.headers.get("cache-control"), /immutable/);
	const [, options] = fetch.mock.calls[0].arguments;
	assert.equal(options.redirect, "error");
	assert.equal(options.headers, undefined);
	assert.ok(options.signal instanceof AbortSignal);
});

test("rejects oversized, non-PNG and unavailable assets without caching the failure", async () => {
	const fetch = mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { "Content-Type": "image/png" } }));
	assert.equal((await GET(request(asset))).status, 413);
	fetch.mock.mockImplementation(async () => new Response("not a png", { headers: { "Content-Type": "text/html" } }));
	assert.equal((await GET(request(asset))).status, 502);
	fetch.mock.mockImplementation(async () => { throw Error("Network unavailable"); });
	const response = await GET(request(asset));
	assert.equal(response.status, 502);
	assert.equal(response.headers.get("cache-control"), null);
});
