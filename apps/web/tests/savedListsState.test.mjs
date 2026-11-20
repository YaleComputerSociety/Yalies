import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadStore() {
	const exports = {};
	const pending = [];
	const source = ts.transpileModule(readFileSync(new URL("../src/hooks/useSavedLists.ts", import.meta.url), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	runInNewContext(source, {
		exports, console,
		require: id => {
			if(id === "react") return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
			if(id === "@/consts") return { API_URL: "" };
			if(id === "yalies-shared") return { API: {
				savedLists: "/lists", savedListMember: (id, netid) => `/lists/${id}/${netid}`,
				savedFor: netid => `/saved/${netid}`,
			} };
			throw new Error(`Unexpected import: ${id}`);
		},
		fetch: (_url, options) => {
			if(options.method === "GET") return Promise.resolve({ ok: true, json: async () => ({ lists: [], total: 0, default_list_id: null }) });
			return new Promise(resolve => pending.push(resolve));
		},
	});
	return { ...exports, finish: (data, ok = true, index = 0) => pending.splice(index, 1)[0]({ ok, json: async () => data, text: async () => "Request failed" }) };
}

const person = { netid: "ben1", saved_data: { saved: true, note: "Private note", list_ids: [1, 2] } };

test("last-list removal immediately clears the saved state and remains cleared after the response", async () => {
	const store = loadStore();
	let entry = store.getSavedEntry(store.useSavedLists(), person);
	const first = store.removeFromList(person.netid, entry, 1);
	assert.deepEqual(Array.from(store.getSavedEntry(store.useSavedLists(), person).listIds), [2]);
	store.finish({ saved: true, list_ids: [2] });
	await first;
	entry = store.getSavedEntry(store.useSavedLists(), person);
	const last = store.removeFromList(person.netid, entry, 2);
	assert.equal(store.getSavedEntry(store.useSavedLists(), person), null);
	store.finish({ saved: false, list_ids: [] });
	await last;
	assert.equal(store.getSavedEntry(store.useSavedLists(), person), null);
});

test("failed removal restores the saved state; old saves with no lists never show a check", async () => {
	const store = loadStore();
	const lastListPerson = { ...person, saved_data: { ...person.saved_data, list_ids: [1] } };
	const original = store.getSavedEntry(store.useSavedLists(), lastListPerson);
	const removal = store.removeFromList(person.netid, original, 1);
	assert.equal(store.getSavedEntry(store.useSavedLists(), person), null);
	store.finish(null, false);
	await assert.rejects(removal, /Request failed/);
	assert.equal(store.getSavedEntry(store.useSavedLists(), person), original);
	assert.equal(store.getSavedEntry(store.useSavedLists(), { netid: "old1", saved_data: { saved: true, note: null, list_ids: [] } }), null);
});

test("a late note response cannot restore a contact removed from its final list", async () => {
	const store = loadStore();
	const current = { listIds: [1], note: "Original" };
	const note = store.updateNote(person.netid, current, "Updated");
	const removal = store.removeFromList(person.netid, current, 1);
	store.finish({ saved: false, list_ids: [] }, true, 1);
	await removal;
	store.finish({ note: "Updated" });
	await note;
	assert.equal(store.getSavedEntry(store.useSavedLists(), person), null);
});
