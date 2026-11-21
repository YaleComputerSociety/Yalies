import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
const source = ts.transpileModule(readFileSync(new URL("../src/helpers/savedListTools.ts", import.meta.url), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
runInNewContext(source, { exports });
const { filterSavedPeople, getListClipboard, savedPeopleForList } = exports;

const people = Array.from({ length: 105 }, (_, index) => ({
	netid: `student${index}`, email: `student${index}@yale.edu`,
	first_name: index === 104 ? "José" : "Alex", preferred_name: index === 103 ? "Sam" : undefined,
	last_name: "Example", year: index === 104 ? 2029 : 2028,
	college: index === 104 ? "Branford College" : "Saybrook College",
	saved_data: { saved: true, list_ids: [1], note: index === 104 ? "Robotics study partner" : null },
}));

test("frontend list filtering finds names and private notes beyond the first display and API pages", () => {
	assert.deepEqual(Array.from(filterSavedPeople(people, "jose robotics", "2029", "Branford College"), person => person.netid), ["student104"]);
	assert.deepEqual(Array.from(filterSavedPeople(people, "sam", "", ""), person => person.netid), ["student103"]);
	assert.equal(filterSavedPeople(people, "robotics", "2028", "").length, 0);
	assert.equal(filterSavedPeople(people, "", "", "Saybrook College").length, 104);
	assert.equal(people.length, 105);
});

test("clipboard export includes the whole list, one value per line, without duplicates or blanks", () => {
	const netids = getListClipboard(people, "netid");
	assert.equal(netids.count, 105);
	assert.equal(netids.text.split("\n").at(-1), "student104");
	assert.equal(netids.text.split("\n").length, 105);
	const emails = getListClipboard([
		people[0], { ...people[0], email: people[0].email.toUpperCase() }, { ...people[1], email: " " }, people[104],
	], "email");
	assert.equal(emails.count, 2);
	assert.equal(emails.missing, 1);
	assert.equal(emails.text.split("\n").length, 2);
	assert.ok(!emails.text.endsWith("\n"));
});


test("All saved combines overlapping lists without duplicates and respects current removals and notes", () => {
	const contacts = [people[0], people[1], { ...people[0], netid: people[0].netid.toUpperCase() }, people[2], people[3]];
	const entries = {
		student0: { listIds: [1, 2], note: "Shared person" },
		student1: { listIds: [2], note: "Updated note" },
		student2: null,
		student3: { listIds: [], note: null },
	};
	const getEntry = person => entries[person.netid.toLowerCase()];
	const all = savedPeopleForList(contacts, getEntry);
	assert.equal(all.length, 2);
	assert.deepEqual(Array.from(all, p => p.netid.toLowerCase()), ["student0", "student1"]);
	assert.equal(all[1].saved_data.note, "Updated note");
	assert.equal(savedPeopleForList(contacts, getEntry, 1).length, 1);
	assert.equal(savedPeopleForList(contacts, getEntry, 2).length, 2);
	assert.equal(savedPeopleForList(contacts, getEntry, 999).length, 0);
	assert.equal(savedPeopleForList([], getEntry).length, 0);
});
