import test from "node:test";
import assert from "node:assert/strict";
import {
	DIRECTORY_EXPORT_SCHEMA,
	FACEBOOK_EXPORT_SCHEMA,
	DirectoryBrowserExport,
	FacebookBrowserExport,
	fingerprintStudents,
	mergeBrowserExports,
	parseFacebookBrowserExport,
} from "./browserImports.js";
import { DirectoryRecord, FacebookStudent } from "./types.js";

const student: FacebookStudent = {
	full_name: "Example, Alex",
	first_name: "Alex",
	last_name: "Example",
	year: "'30",
	pronouns: "",
	college: "Branford College",
	photo_id: "12345",
	details_raw: "",
};

const record = (overrides: Partial<DirectoryRecord>): DirectoryRecord => ({
	NetId: "ae123",
	EmailAddress: "alex.example@yale.edu",
	UPI: 987654,
	FirstName: "Alex",
	LastName: "Example",
	PrimarySchoolCode: "YC",
	PrimarySchoolName: "Yale College",
	StudentExpectedGraduationYear: 2030,
	ResidentialCollegeName: "Branford College",
	...overrides,
} as DirectoryRecord);

test("Facebook browser export verifies its content fingerprint", () => {
	const fingerprint = fingerprintStudents([student]);
	const parsed = parseFacebookBrowserExport({
		schemaVersion: FACEBOOK_EXPORT_SCHEMA,
		exportedAt: "2026-08-01T00:00:00.000Z",
		sourceUrl: "https://students.yale.edu/facebook/PhotoPageNew",
		fingerprint,
		students: [student],
	});
	assert.equal(parsed.fingerprint, fingerprint);
	assert.throws(() => parseFacebookBrowserExport({ ...parsed, fingerprint: "tampered" }), /fingerprint/);
});

test("browser exports must share a fingerprint and merge using directory scoring", () => {
	const fingerprint = fingerprintStudents([student]);
	const facebook: FacebookBrowserExport = {
		schemaVersion: FACEBOOK_EXPORT_SCHEMA,
		exportedAt: "2026-08-01T00:00:00.000Z",
		sourceUrl: "https://students.yale.edu/facebook/PhotoPageNew",
		fingerprint,
		students: [student],
	};
	const directory: DirectoryBrowserExport = {
		schemaVersion: DIRECTORY_EXPORT_SCHEMA,
		exportedAt: "2026-08-01T01:00:00.000Z",
		sourceUrl: "https://directory.yale.edu/",
		facebookFingerprint: fingerprint,
		facebookExportedAt: facebook.exportedAt,
		entryCount: 1,
		entries: [{
			index: 0,
			full_name: student.full_name,
			queries: ["Alex,Example"],
			records: [
				record({ NetId: "wrong1", UPI: 111111, ResidentialCollegeName: "Morse College", StudentExpectedGraduationYear: 2029 }),
				record({ NetId: "right1" }),
			],
		}],
	};

	const merged = mergeBrowserExports(facebook, directory);
	assert.equal(merged.matched, 1);
	assert.equal(merged.students[0].netid, "right1");
	assert.throws(
		() => mergeBrowserExports(facebook, { ...directory, facebookFingerprint: "other" }),
		/different Facebook export/,
	);
});

test("global matching reserves identities for stronger matches and leaves ties unmatched", () => {
	const students: FacebookStudent[] = [
		{ ...student, full_name: "Brown, Eli", first_name: "Eli", last_name: "Brown", college: "Saybrook College" },
		{ ...student, full_name: "Brown, Elias", first_name: "Elias", last_name: "Brown", college: "Grace Hopper College" },
		{ ...student, full_name: "Lee, Mark", first_name: "Mark", last_name: "Lee", year: "'28", college: "Grace Hopper College", photo_id: "1" },
		{ ...student, full_name: "Lee, Mark", first_name: "Mark", last_name: "Lee", year: "'28", college: "Grace Hopper College", photo_id: "2" },
	];
	const elias = record({
		NetId: "eab275", UPI: 26034424, FirstName: "Elias", LastName: "Brown",
		ResidentialCollegeName: "Grace Hopper College",
	});
	const mark = record({
		NetId: "mjl259", UPI: 25329111, FirstName: "Mark", LastName: "Lee",
		StudentExpectedGraduationYear: 2028, ResidentialCollegeName: "Grace Hopper College",
	});
	const fingerprint = fingerprintStudents(students);
	const facebook: FacebookBrowserExport = {
		schemaVersion: FACEBOOK_EXPORT_SCHEMA,
		exportedAt: "2026-08-01T00:00:00.000Z",
		sourceUrl: "https://students.yale.edu/facebook/PhotoPageNew",
		fingerprint,
		students,
	};
	const directory: DirectoryBrowserExport = {
		schemaVersion: DIRECTORY_EXPORT_SCHEMA,
		exportedAt: "2026-08-01T01:00:00.000Z",
		sourceUrl: "https://directory.yale.edu/",
		facebookFingerprint: fingerprint,
		facebookExportedAt: facebook.exportedAt,
		entryCount: students.length,
		entries: students.map((item, index) => ({
			index,
			full_name: item.full_name,
			queries: [],
			records: index < 2 ? [elias] : [mark],
		})),
	};

	const merged = mergeBrowserExports(facebook, directory);
	assert.equal(merged.students[0].netid, undefined);
	assert.equal(merged.students[1].netid, "eab275");
	assert.equal(merged.students[2].netid, undefined);
	assert.equal(merged.students[3].netid, undefined);
	assert.equal(merged.matched, 1);
	assert.equal(merged.ambiguous, 2);
});
