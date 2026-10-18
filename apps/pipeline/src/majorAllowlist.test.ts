import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext, Script } from "node:vm";
import { decode } from "html-entities";
import { ALLOWED_MAJORS, findStudentsWithInvalidMajor, normalizeAllowedMajor } from "./allowedMajors.js";
import { parseFacebookPage } from "./sources/facebook.js";
import { loadToDatabase, toDbRow } from "./loadDb.js";
import { validateEnriched, validateFacebook } from "./validate.js";
import { FACEBOOK_EXPORT_SCHEMA, fingerprintStudents, parseFacebookBrowserExport } from "./browserImports.js";
import { FacebookStudent } from "./types.js";

// Run the real browser parser declarations without starting a scrape/download.
// The textarea stub supplies only browser HTML-entity decoding; parsing logic
// comes directly from the paste-in-console script, not a test reimplementation.
const browserSource = readFileSync(new URL("../browser/facebook-export.js", import.meta.url), "utf8");
new Script(browserSource);
const fetchMarker = browserSource.indexOf('  console.log("Yalies: requesting');
assert.ok(fetchMarker > 0);
const browser = await runInNewContext(
	`${browserSource.slice(0, fetchMarker)}return { parseDetails, allowedMajors }; })();`,
	{
		location: { hostname: "students.yale.edu" },
		document: {
			createElement: () => ({ innerHTML: "", get value(): string { return decode(this.innerHTML); } }),
		},
	},
) as { parseDetails: (parts: string[], student: Partial<FacebookStudent>) => void; allowedMajors: Set<string> };

function parse(details: string): FacebookStudent {
	const [student] = parseFacebookPage(`<div class="student_container">
		<h5 class="yalehead">Example, Alex</h5><div class="student_year">'27</div>
		<div class="student_info_pronoun">they/them</div>
		<div class="student_img"><img src="/facebook/Photo?id=12345"></div>
		<div class="student_info">Pierson College</div>
		<div class="student_info">${details}</div></div>`);
	const browserStudent: Partial<FacebookStudent> = {};
	browser.parseDetails(details.split(/<br\s*\/?>/i), browserStudent);
	for (const field of ["major", "address", "birthday", "phone"] as const) {
		assert.equal(browserStudent[field], student[field], `Browser/pipeline mismatch for ${field}: ${details}`);
	}
	assert.equal(student.full_name, "Example, Alex");
	assert.equal(student.first_name, "Alex");
	assert.equal(student.last_name, "Example");
	assert.equal(student.year, "'27");
	assert.equal(student.pronouns, "they/them");
	assert.equal(student.college, "Pierson College");
	assert.equal(student.photo_id, "12345");
	return student;
}

const rejected = [
	"Brooklyn,", "Cancun, Mexico", "E Stroudsburg, PA", "Hong Kong,", "Korea, South",
	"Lexington,", "Madagascar", "Miami,", "Palestine,", "San Francisco,", "Turks and Caicos Islands",
	"student@yale.edu", "other.student@yale.edu", "San Diego, Undeclared", "San Francisco, Computer Science",
	"MBA", "A New Major", "computer science", "Art Street", "Economics Department", "Music City",
];

test("the standalone browser script contains exactly the approved 86 values", () => {
	assert.equal(ALLOWED_MAJORS.length, 86);
	assert.equal(new Set(ALLOWED_MAJORS).size, 86);
	assert.deepEqual(Array.from(browser.allowedMajors), ALLOWED_MAJORS);
	assert.ok(ALLOWED_MAJORS.includes("Undeclared"));
	assert.ok(!ALLOWED_MAJORS.includes("MBA"));
});

test("both scrapers retain every approved value and preserve all surrounding fields", () => {
	for (const major of ALLOWED_MAJORS) {
		const encoded = major.replaceAll("&", "&amp;");
		const student = parse(`6-1438 /<br>New Haven, CT<br>${encoded}<br>Jul 26`);
		assert.equal(student.major, major);
		assert.equal(student.address, "New Haven, CT");
		assert.equal(student.phone, "6-1438");
		assert.equal(student.birthday, "Jul 26");
		assert.equal(toDbRow(student).major, major);
	}
});

test("rejecting a candidate does not move it into the address or alter raw details", () => {
	for (const candidate of rejected) {
		const details = `6-1438 /<br>New Haven, CT<br>${candidate}<br>Jul 26`;
		const student = parse(details);
		assert.equal(student.major, undefined, candidate);
		assert.equal(student.address, "New Haven, CT", candidate);
		assert.equal(student.phone, "6-1438");
		assert.equal(student.birthday, "Jul 26");
		assert.equal(student.details_raw, details.split("<br>").join(" | "));
	}
});

test("existing state/address handling, empty details and college-filtered cards are preserved", () => {
	for (const location of ["NY", "Connecticut", "New Haven, CT", "123 Main Street", "Canada"]) {
		const student = parse(`${location}<br>May 11`);
		assert.equal(student.major, undefined);
		assert.equal(student.address, location);
		assert.equal(student.birthday, "May 11");
	}
	assert.equal(parse("").major, undefined);
	assert.equal(parse("6-1438 /<br>Jul 26").address, undefined);
	const [filtered] = parseFacebookPage(`<select name="orgSelect"><option selected value="Pierson College">Pierson</option></select>
		<div class="student_container"><h5 class="yalehead">Example, Alex</h5>
		<div class="student_info">NY<br>Computer Science<br>May 11</div></div>`);
	assert.equal(filtered.college, "Pierson College");
	assert.equal(filtered.major, "Computer Science");
	assert.equal(filtered.address, "NY");
});

test("only transport escaping and edge whitespace are normalized; no fuzzy or substring matching", () => {
	assert.equal(parse("NY<br>&nbsp;Computer Science&nbsp;<br>Jul 26").major, "Computer Science");
	assert.equal(parse("NY<br>Ethics,Politics &amp;amp; Economics<br>Jul 26").major, "Ethics,Politics & Economics");
	assert.equal(normalizeAllowedMajor("  Computer Science  "), "Computer Science");
	assert.equal(normalizeAllowedMajor("Ethics,Politics &amp; Economics"), "Ethics,Politics & Economics");
	for (const value of [...rejected, "CA", "New York", "Computer  Science", 123, {}, ["Art"]]) {
		assert.equal(normalizeAllowedMajor(value), undefined);
		assert.equal(findStudentsWithInvalidMajor([{ major: value }]).length, 1);
	}
	assert.deepEqual(findStudentsWithInvalidMajor([{}, { major: null }, { major: "" }, { major: "  " }]), []);
});

test("cached browser exports with invalid majors fail validation without mutating their data", () => {
	const student = { ...parse("Computer Science"), major: "Palestine," };
	const saved = structuredClone(student);
	const imported = parseFacebookBrowserExport({
		schemaVersion: FACEBOOK_EXPORT_SCHEMA,
		exportedAt: new Date().toISOString(),
		sourceUrl: "https://students.yale.edu/facebook/",
		fingerprint: fingerprintStudents([student]),
		students: [student],
	});
	for (const validate of [validateFacebook, validateEnriched]) {
		assert.ok(validate(imported.students).failures.some(message => message.includes("outside the approved allowlist")));
		assert.ok(!validate([parse("Computer Science")]).failures.some(message => message.startsWith("Major integrity:")));
	}
	assert.deepEqual(student, saved);
});

test("database row conversion refuses unknown majors and leaves valid students unchanged", () => {
	const student = parse("6-1438 /<br>New Haven, CT<br>Computer Science<br>Jul 26");
	const saved = structuredClone(student);
	for (const major of [...rejected, "CA"]) {
		assert.throws(() => toDbRow({ ...student, major }), /Refusing unapproved major/);
	}
	const row = toDbRow(student);
	assert.equal(row.major, "Computer Science");
	assert.equal(row.address, "New Haven, CT");
	assert.equal(row.phone, "6-1438");
	assert.equal(row.birth_month, 7);
	assert.equal(row.birth_day, 26);
	assert.equal(row.year, 2027);
	assert.equal(row.image, "https://storage.googleapis.com/yalies-photos/12345.jpg");
	assert.deepEqual(student, saved);
	assert.equal(toDbRow({ ...student, major: undefined }).major, undefined);
});

test("load rejects old invalid majors before any database connection, including force/apply", async () => {
	for (const major of ["Palestine,", "student@yale.edu", "San Francisco, Computer Science", "CA"]) {
		await assert.rejects(
			loadToDatabase([{ ...parse("Computer Science"), major }], "not-a-database-url", {
				dryRun: false, force: true, requireConfirmation: false,
			}),
			/outside the approved allowlist/,
		);
	}
});
