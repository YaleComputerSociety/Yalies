import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
const source = ts.transpileModule(readFileSync(new URL("../src/helpers/yalemojiOrdering.ts", import.meta.url), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
runInNewContext(source, { exports });
const { prioritizeYaleMojis, prioritizeYaleMojisWithinYear, spreadYaleMojis } = exports;

function person(netid, year = 2029, avatar = false) {
	return { netid, year, first_name: netid, last_name: "Test", yalemoji: avatar ? { png_url: `${netid}.png` } : null };
}
const ids = people => Array.from(people, person => person.netid);

test("search promotes avatars within each year and preserves proximity order in both groups", () => {
	const people = [person("a"), person("b", 2029, true), person("c"), person("d", 2029, true),
		person("e", 2028), person("f", 2028, true), person("g", 2030)];
	const original = [...people];
	assert.deepEqual(ids(prioritizeYaleMojisWithinYear(people)), ["b", "d", "a", "c", "f", "e", "g"]);
	assert.deepEqual(people, original);
});

test("later search batches can promote avatars to the top of their loaded year", () => {
	const first = [person("a"), person("b", 2029, true)];
	const second = [person("c", 2029, true), person("d", 2028), person("e", 2028, true)];
	assert.deepEqual(ids(prioritizeYaleMojisWithinYear([...first, ...second])), ["b", "c", "a", "e", "d"]);
});

test("search preserves year positions even for interleaved and missing years", () => {
	const people = [person("a", 2029), person("b", 2028), person("c", 2029, true),
		{ ...person("d"), year: undefined }, person("e", 2028, true), { ...person("f", 2029, true), year: undefined }];
	const ordered = prioritizeYaleMojisWithinYear(people);
	assert.deepEqual(Array.from(ordered, person => person.year), people.map(person => person.year));
	assert.deepEqual(ids(ordered), ["c", "e", "a", "f", "b", "d"]);
});

test("birthdays promote all avatars regardless of year while preserving relative rank", () => {
	const people = [person("a"), person("b", 2029, true), person("c", 2028), person("d", 2028, true)];
	assert.deepEqual(ids(prioritizeYaleMojis(people)), ["b", "d", "a", "c"]);
});

test("an empty or absent avatar URL does not receive priority", () => {
	const people = [person("a"), { ...person("b"), yalemoji: { png_url: "" } }, person("c", 2029, true)];
	assert.deepEqual(ids(prioritizeYaleMojis(people)), ["c", "a", "b"]);
});

test("sparse browse avatars start first and have three ordinary cards between them", () => {
	const people = Array.from({ length: 20 }, (_, index) => person(`${index}`, 2029, index === 8 || index === 18));
	const ordered = spreadYaleMojis(people);
	assert.deepEqual(ids(ordered).slice(0, 5), ["8", "0", "1", "2", "18"]);
	assert.deepEqual(ids(people).slice(0, 3), ["0", "1", "2"]);
});

test("browse spacing adapts to every avatar count without losing people or relative order", () => {
	for(let count = 0; count <= 20; count++) {
		const people = Array.from({ length: 20 }, (_, index) => person(`${index}`, 2029, index >= 20 - count));
		const ordered = spreadYaleMojis(people);
		const avatarIndexes = Array.from(ordered, (person, index) => person.yalemoji ? index : -1).filter(index => index >= 0);
		assert.equal(ordered.length, people.length);
		assert.equal(new Set(ids(ordered)).size, people.length);
		assert.deepEqual(ids(ordered.filter(person => person.yalemoji)), ids(people.filter(person => person.yalemoji)));
		assert.deepEqual(ids(ordered.filter(person => !person.yalemoji)), ids(people.filter(person => !person.yalemoji)));
		if(count) assert.equal(avatarIndexes[0], 0);
		for(let index = 1; index < avatarIndexes.length; index++) {
			const gap = avatarIndexes[index] - avatarIndexes[index - 1] - 1;
			assert.ok(gap >= 0 && gap <= 3);
			if(count >= 10) assert.ok(gap <= 1);
		}
	}
});

test("later browse batches promote their own avatars and leave earlier cards in place", () => {
	const first = spreadYaleMojis([person("a"), person("b", 2029, true), person("c")]);
	const second = spreadYaleMojis([person("d"), person("e", 2029, true), person("f")]);
	const third = spreadYaleMojis([person("g"), person("h")]);
	assert.deepEqual(ids([...first, ...second, ...third]), ["b", "a", "c", "e", "d", "f", "g", "h"]);
	for(const order of [prioritizeYaleMojis, prioritizeYaleMojisWithinYear, spreadYaleMojis]) {
		assert.deepEqual(ids(order([])), []);
	}
});

test("hidden avatars do not receive search, birthday, or browse priority", () => {
	const hidden = { ...person("hidden", 2029, true), user_profile: { netid: "hidden", show_yalemoji: false } };
	const people = [person("ordinary"), hidden, person("visible", 2029, true)];
	for(const order of [prioritizeYaleMojis, prioritizeYaleMojisWithinYear, spreadYaleMojis]) {
		assert.deepEqual(ids(order(people)), ["visible", "ordinary", "hidden"]);
	}
});
