import assert from "node:assert/strict";
import test from "node:test";
import { parseFacebookPage } from "./sources/facebook.js";

function page(details: string): string {
	return `
		<div class="student_container">
			<div class="student_year">'27</div>
			<div class="student_img"><img src="/facebook/Photo?id=12345"></div>
			<h5 class="yalehead">Perkins-Martin, Jaidynn</h5>
			<div class="student_info">Pierson College</div>
			<div class="student_info">${details}</div>
		</div>
	`;
}

test("parses a comma-containing major after a state-only address", () => {
	const [student] = parseFacebookPage(page(
		"6-1438 /<br>AL<br>Ethics,Politics &amp; Economics<br>Jul 26",
	));

	assert.equal(student.phone, "6-1438");
	assert.equal(student.address, "AL");
	assert.equal(student.major, "Ethics,Politics & Economics");
	assert.equal(student.birthday, "Jul 26");
});

test("does not turn a state-only address into a major when major is absent", () => {
	const [student] = parseFacebookPage(page("NY<br>May 11"));

	assert.equal(student.address, "NY");
	assert.equal(student.major, undefined);
	assert.equal(student.birthday, "May 11");
});

test("keeps city/state in address and the following text as major", () => {
	const [student] = parseFacebookPage(page("New Haven, CT<br>Computer Science<br>Jan 1"));

	assert.equal(student.address, "New Haven, CT");
	assert.equal(student.major, "Computer Science");
});
