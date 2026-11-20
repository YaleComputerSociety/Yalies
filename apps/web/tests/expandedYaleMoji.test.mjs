import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/hooks/expandedYaleMoji.ts", import.meta.url), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function session() {
	const exports = {};
	runInNewContext(source, { exports });
	return exports;
}

test("expanding a card replaces the previous card across result sections", () => {
	const state = session();
	const visibleCards = [];
	state.subscribeExpandedYaleMoji(() => {
		visibleCards.push(state.getExpandedYaleMoji());
	});
	state.setExpandedYaleMoji("birthday-card", true);
	state.setExpandedYaleMoji("search-card", true);
	state.setExpandedYaleMoji("search-card", false);
	assert.deepEqual(visibleCards, ["birthday-card", "search-card", null]);
});

test("a previous card unmounting or losing its avatar cannot collapse the new card", () => {
	const state = session();
	state.setExpandedYaleMoji("old-card", true);
	state.setExpandedYaleMoji("new-card", true);
	state.setExpandedYaleMoji("old-card", false);
	assert.equal(state.getExpandedYaleMoji(), "new-card");
	state.setExpandedYaleMoji("new-card", false);
	assert.equal(state.getExpandedYaleMoji(), null);
});

test("duplicate appearances of one person use separate cards and removed cards stop receiving updates", () => {
	const state = session();
	let updates = 0;
	const unsubscribe = state.subscribeExpandedYaleMoji(() => { updates++; });
	state.setExpandedYaleMoji("same-person-birthday", true);
	state.setExpandedYaleMoji("same-person-search", true);
	assert.equal(state.getExpandedYaleMoji(), "same-person-search");
	assert.equal(updates, 2);
	unsubscribe();
	state.setExpandedYaleMoji("same-person-search", false);
	assert.equal(updates, 2);
});
