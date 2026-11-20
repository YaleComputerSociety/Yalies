import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const avatar = {
	version: 3,
	png_url: "https://assets.example/avatar.png",
	svg_url: "https://assets.example/avatar.svg",
	background_url: "https://assets.example/background.svg",
};
const source = ts.transpileModule(readFileSync(new URL("../src/hooks/yalemojiCache.ts", import.meta.url), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function storage() {
	const values = new Map();
	return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

function events() {
	const listeners = new Map();
	return {
		addEventListener(name, fn) {
			if(!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name).add(fn);
		},
		removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
		emit: (name, event) => [...(listeners.get(name) ?? [])].forEach((fn) => fn(event)),
	};
}

function setup({ cached, netid = "abc123", localStorage = storage(), sessionStorage = storage(), loading = false } = {}) {
	if(cached !== undefined) localStorage.setItem("yalies-yalemoji", JSON.stringify({ netid, avatar: cached }));
	const window = { ...events(), localStorage, sessionStorage };
	const document = { ...events(), visibilityState: "visible", readyState: loading ? "loading" : "complete" };
	const timers = new Map();
	let now = 100;
	let nextTimer = 0;
	let nextResponse = { netid: "abc123", yalemoji: avatar };
	let fail = false;
	let status = 200;
	const calls = [];
	const api = {};
	runInNewContext(source, {
		exports: api, window, document, URL,
		require: (id) => id === "@/consts" ? { API_URL: "https://api.example" } : { API: { profileMeYaleMoji: "/v3/profile/me/yalemoji" } },
		performance: { now: () => now, getEntriesByType: () => [{ loadEventEnd: loading ? 0 : 100 }] },
		Date: { now: () => now },
		setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, due: now + delay }); return nextTimer; },
		clearTimeout: (id) => timers.delete(id),
		fetch: async (...args) => {
			calls.push(args);
			if(fail) throw new Error("offline");
			return { ok: status === 200, json: async () => nextResponse };
		},
	});
	return {
		api, calls, window, document, localStorage, sessionStorage,
		respond: (result) => { nextResponse = result; },
		fail: () => { fail = true; },
		status: (value) => { status = value; },
		async tick(ms = 0) {
			now += ms;
			for(const [id, timer] of timers) {
				if(timer.due <= now) { timers.delete(id); timer.fn(); }
			}
			await new Promise((resolve) => setImmediate(resolve));
		},
	};
}

test("a cached avatar renders immediately and refreshes five seconds after page load", async () => {
	const env = setup({ cached: avatar });
	let displayed;
	env.api.subscribeYaleMoji("abc123", (value) => { displayed = value; });
	assert.equal(displayed.png_url, avatar.png_url);
	assert.equal(env.calls.length, 0);
	await env.tick(4999);
	assert.equal(env.calls.length, 0);
	await env.tick(1);
	assert.equal(env.calls.length, 1);
	assert.equal(env.calls[0][0], "https://api.example/v3/profile/me/yalemoji");
	assert.equal(env.calls[0][1].credentials, "include");
});

test("missing, null, malformed and another user's cached avatar fetch immediately", async () => {
	for(const options of [{}, { cached: null }, { cached: {} }, { cached: avatar, netid: "other123" }]) {
		const env = setup(options);
		env.api.subscribeYaleMoji("abc123", () => {});
		assert.equal(env.calls.length, 1);
		await env.tick();
	}
});

test("route changes and multiple profile buttons share the initial request even after no avatar is found", async () => {
	const env = setup();
	env.respond({ netid: "abc123", yalemoji: null });
	const unsubscribe = env.api.subscribeYaleMoji("abc123", () => {});
	env.api.subscribeYaleMoji("abc123", () => {});
	await env.tick();
	unsubscribe();
	await env.tick(60000);
	env.api.subscribeYaleMoji("abc123", () => {});
	assert.equal(env.calls.length, 1);
});

test("the delayed refresh survives navigation without restarting its timer", async () => {
	const env = setup({ cached: avatar });
	const unsubscribe = env.api.subscribeYaleMoji("abc123", () => {});
	await env.tick(2000);
	unsubscribe();
	env.api.subscribeYaleMoji("abc123", () => {});
	await env.tick(3000);
	assert.equal(env.calls.length, 1);
});

test("ordinary focus does nothing; returning from Yalemoji refreshes once and cancels the delay", async () => {
	const env = setup({ cached: avatar });
	env.api.subscribeYaleMoji("abc123", () => {});
	env.window.emit("focus");
	env.document.emit("visibilitychange");
	assert.equal(env.calls.length, 0);
	env.api.markYaleMojiVisit();
	env.document.visibilityState = "hidden";
	env.document.emit("visibilitychange");
	assert.equal(env.calls.length, 0);
	env.document.visibilityState = "visible";
	env.document.emit("visibilitychange");
	env.window.emit("focus");
	await env.tick(5000);
	assert.equal(env.calls.length, 1);
	// A later editor visit must still refresh.
	env.api.markYaleMojiVisit();
	env.window.emit("focus");
	await env.tick();
	assert.equal(env.calls.length, 2);
});

test("a reload uses persisted avatars and a same-tab Yalemoji return refreshes immediately", async () => {
	const first = setup();
	first.api.subscribeYaleMoji("abc123", () => {});
	await first.tick();
	const reload = setup({ localStorage: first.localStorage, sessionStorage: first.sessionStorage });
	reload.api.subscribeYaleMoji("abc123", () => {});
	assert.equal(reload.calls.length, 0);
	reload.api.markYaleMojiVisit();
	const returned = setup({ localStorage: first.localStorage, sessionStorage: first.sessionStorage });
	returned.api.subscribeYaleMoji("abc123", () => {});
	assert.equal(returned.calls.length, 1);
});

test("network failures preserve the cached avatar and sign-out clears it", async () => {
	const env = setup({ cached: avatar });
	env.fail();
	let displayed;
	env.api.subscribeYaleMoji("abc123", (value) => { displayed = value; });
	await env.tick(5000);
	assert.equal(displayed.png_url, avatar.png_url);
	assert.ok(env.localStorage.getItem("yalies-yalemoji"));
	env.api.markYaleMojiVisit();
	env.api.clearYaleMojiCache();
	assert.equal(env.localStorage.getItem("yalies-yalemoji"), null);
	assert.equal(env.sessionStorage.getItem("yalies-yalemoji-return"), null);
});

test("returning from the editor updates all buttons and persists the latest avatar or its removal", async () => {
	const env = setup({ cached: avatar });
	let first;
	let second;
	env.api.subscribeYaleMoji("abc123", (value) => { first = value; });
	env.api.subscribeYaleMoji("abc123", (value) => { second = value; });
	env.respond({ netid: "abc123", yalemoji: { ...avatar, version: 4 } });
	env.api.markYaleMojiVisit();
	env.window.emit("focus");
	await env.tick();
	assert.equal(first.version, 4);
	assert.equal(second.version, 4);
	assert.equal(JSON.parse(env.localStorage.getItem("yalies-yalemoji")).avatar.version, 4);
	env.respond({ netid: "abc123", yalemoji: null });
	env.api.markYaleMojiVisit();
	env.window.emit("focus");
	await env.tick();
	assert.equal(first, null);
	assert.equal(second, null);
	const reload = setup({ localStorage: env.localStorage });
	reload.api.subscribeYaleMoji("abc123", () => {});
	assert.equal(reload.calls.length, 1);
});

test("cached lookups wait for page load before starting the five-second delay", async () => {
	const env = setup({ cached: avatar, loading: true });
	env.api.subscribeYaleMoji("abc123", () => {});
	await env.tick(10000);
	assert.equal(env.calls.length, 0);
	env.window.emit("load");
	await env.tick(4999);
	assert.equal(env.calls.length, 0);
	await env.tick(1);
	assert.equal(env.calls.length, 1);
});

test("the banner starts hidden even with cached absence and opens only after confirmed absence", async () => {
	const env = setup({ cached: null });
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	assert.equal(visible, false);
	await env.tick();
	assert.equal(visible, true);
	assert.equal(env.calls.length, 1);
});

test("failures, incomplete results and another user's results cannot open the banner", async () => {
	for(const scenario of ["offline", "unavailable", "incomplete", "malformed", "other-user", "avatar"]) {
		const env = setup({ cached: null });
		if(scenario === "offline") env.fail();
		if(scenario === "unavailable") env.status(503);
		if(scenario === "incomplete") env.respond({ netid: "abc123" });
		if(scenario === "malformed") env.respond({ netid: "abc123", yalemoji: false });
		if(scenario === "other-user") env.respond({ netid: "other123", yalemoji: null });
		let visible;
		env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
		await env.tick();
		assert.equal(visible, false, scenario);
		await env.tick(600000);
		assert.equal(visible, false, scenario);
	}
});

test("a visit hides the banner until a new API response confirms no avatar", async () => {
	const env = setup();
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	const unsubscribe = env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	await env.tick();
	assert.equal(visible, true);
	env.api.markYaleMojiVisit();
	assert.equal(visible, false);
	await env.tick(600000);
	assert.equal(visible, false);
	assert.equal(env.calls.length, 1);
	// Navigation cannot reuse the previous missing-avatar result.
	unsubscribe();
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	assert.equal(visible, false);
	env.window.emit("focus");
	assert.equal(visible, false);
	await env.tick();
	assert.equal(env.calls.length, 2);
	assert.equal(visible, true);
});

test("a failed lookup after a visit keeps the banner hidden", async () => {
	const env = setup();
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	await env.tick();
	env.api.markYaleMojiVisit();
	env.status(503);
	env.window.emit("focus");
	await env.tick(600000);
	assert.equal(visible, false);
	assert.equal(env.calls.length, 2);
});

test("a reload waits for fresh confirmation and ignores old snooze timestamps", async () => {
	const localStorage = storage();
	localStorage.setItem("yalies-yalemoji-banner-until:abc123", "600100");
	const env = setup({ cached: null, localStorage });
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	assert.equal(visible, false);
	await env.tick();
	assert.equal(visible, true);
});

test("finding an avatar on return keeps the banner hidden", async () => {
	const env = setup();
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	await env.tick();
	env.api.markYaleMojiVisit();
	env.respond({ netid: "abc123", yalemoji: avatar });
	env.window.emit("focus");
	await env.tick();
	assert.equal(visible, false);
	await env.tick(600000);
	assert.equal(visible, false);
});

test("cross-tab avatar updates hide the banner and cached absence cannot reopen it", async () => {
	const env = setup();
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	await env.tick();
	assert.equal(visible, true);
	env.localStorage.setItem("yalies-yalemoji", JSON.stringify({ netid: "abc123", avatar }));
	env.window.emit("storage", { key: "yalies-yalemoji" });
	assert.equal(visible, false);
	env.localStorage.setItem("yalies-yalemoji", JSON.stringify({ netid: "abc123", avatar: null }));
	env.window.emit("storage", { key: "yalies-yalemoji" });
	assert.equal(visible, false);
});

test("visit and confirmation behavior works when storage is disabled", async () => {
	const disabledStorage = { getItem() { throw new Error("disabled"); }, setItem() { throw new Error("disabled"); }, removeItem() { throw new Error("disabled"); } };
	const env = setup({ localStorage: disabledStorage, sessionStorage: disabledStorage });
	env.respond({ netid: "abc123", yalemoji: null });
	let visible;
	env.api.subscribeYaleMojiBanner("abc123", value => { visible = value; });
	await env.tick();
	assert.equal(visible, true);
	env.api.markYaleMojiVisit();
	assert.equal(visible, false);
	env.window.emit("focus");
	await env.tick();
	assert.equal(visible, true);
});
