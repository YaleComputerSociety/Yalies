import { test } from "node:test";
import assert from "node:assert/strict";
import { collegeDistance, searchProximity } from "../build/helpers/searchProximity.js";

test("year proximity prefers the higher year for equal gaps", () => {
	const years = [2027, 2028, 2031, null, 2030, 2029].map(year => ({ year }));
	assert.deepEqual(years.sort(searchProximity({ year: 2029 }).compare).map(p => p.year),
		[2029, 2030, 2028, 2031, 2027, null]);
});

test("college grid uses horizontal, vertical, diagonal and combined step costs", () => {
	const distance = to => collegeDistance("Branford College", to) / 10;
	assert.equal(distance("Branford College"), 0);
	assert.equal(distance("Saybrook College"), 0.9);
	assert.equal(distance("Davenport College"), 1);
	assert.equal(collegeDistance("Davenport College", "Saybrook College") / 10, 1.4);
	assert.equal(distance("Berkeley College"), 2.3);
	assert.equal(collegeDistance("Pierson College", "Ezra Stiles College") / 10, 1.8);
	assert.equal(collegeDistance("Ezra Stiles College", "Morse College") / 10, 0.9);
	assert.equal(collegeDistance("Morse College", "Pierson College") / 10, 2.7);
});

test("equidistant colleges sort alphabetically, after year proximity", () => {
	const people = [
		{ year: 2029, college: "Pierson College" },
		{ year: 2030, college: "Trumbull College" },
		{ year: 2029, college: "Benjamin Franklin College" },
	];
	assert.equal(collegeDistance("Trumbull College", people[0].college), collegeDistance("Trumbull College", people[2].college));
	assert.deepEqual(people.sort(searchProximity({ year: 2029, college: "Trumbull College" }).compare).map(p => p.college),
		["Benjamin Franklin College", "Pierson College", "Trumbull College"]);
});

test("missing viewer fields skip that dimension and missing result fields sort last", () => {
	const a = { year: 2029, college: "Branford College" };
	const b = { year: 2028, college: "Saybrook College" };
	assert.equal(searchProximity().compare(a, b), 0);
	assert.equal(searchProximity({}).compare(a, b), 0);
	const people = [{ college: null }, { college: "Unknown College" }, b, a];
	assert.deepEqual(people.sort(searchProximity({ college: "Branford College" }).compare).map(p => p.college),
		["Branford College", "Saybrook College", "Unknown College", null]);
	assert.ok(searchProximity({ college: "Unknown College" }).compare({ college: "Unknown College" }, a) < 0);
});
