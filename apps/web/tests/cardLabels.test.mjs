import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(path, imports = {}) {
	const exports = {};
	const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	runInNewContext(source, { exports, require: name => {
		if(name in imports) return imports[name];
		throw new Error(`Unexpected import: ${name}`);
	} });
	return exports;
}

const { MAJOR_ABBREVIATIONS, COLLEGE_ABBREVIATIONS, formatCardCollegeYear, formatCardMajor } = load("../src/helpers/cardLabels.ts");
const { ALLOWED_MAJORS } = load("../../pipeline/src/allowedMajors.ts", { "html-entities": { decode: value => value } });
const { getMajorIconKind } = load("../src/helpers/majorIconKind.ts");

test("every approved major has an editable nonempty card acronym", () => {
	assert.equal(ALLOWED_MAJORS.length, 86);
	assert.deepEqual(Object.keys(MAJOR_ABBREVIATIONS).sort(), Array.from(ALLOWED_MAJORS).sort());
	for(const major of ALLOWED_MAJORS) assert.ok(MAJOR_ABBREVIATIONS[major].trim(), major);
});

test("college names use their directory shorthands, with graduation years intact", () => {
	assert.equal(Object.keys(COLLEGE_ABBREVIATIONS).length, 14);
	assert.equal(formatCardCollegeYear({ college: "Benjamin Franklin College", year: 2029 }), "BF '29");
	assert.equal(formatCardCollegeYear({ college: "Berkeley College", college_code: "BK", year: 2028 }), "BK '28");
	assert.equal(formatCardCollegeYear({ college: "Morse College" }), "MC");
	assert.equal(formatCardCollegeYear({ college: "Pauli Murray College" }), "MY");
	assert.equal(formatCardCollegeYear({ college_code: "bf" }), "BF");
});

test("unrecognized majors and college names stay readable instead of disappearing", () => {
	assert.equal(formatCardMajor("A future major"), "A future major");
	assert.equal(formatCardCollegeYear({ college: "Visiting Scholar" }), "Visiting Scholar");
	assert.equal(formatCardCollegeYear({ year: 2030 }), "'30");
	assert.equal(formatCardCollegeYear({}), "");
});

test("major icons follow their subject, including combined and intensive majors", () => {
	const groups = {
		computer: ["Computer Science", "Computer Science & Psychology", "Computer Science & Econ", "Computing and the Arts", "Elec Engineering & Comp Sci"],
		flask: ["Chemical Engineering", "Chemistry (Int.)", "Engineering Science-Chemical"],
		planet: ["Astronomy", "Astrophysics", "Earth and Planetary Sciences"],
		brain: ["Cognitive Science", "Psychology", "Neuroscience"],
		dna: ["Biomedical Engineering", "Ecology & Evolutionary Biology", "Molecular Biophysics & Biochem", "Molecular,Cellular,DevBio(Int)"],
		calculator: ["Applied Mathematics", "Mathematics (Int.)", "Mathematics & Physics", "Statistics and Data Science"],
		battery: ["Electrical Engineering", "Engineering Science-Electrical"],
		briefcase: ["Economics", "Economics & Mathematics", "Global Affairs"],
		government: ["Political Science (Int.)", "Ethics,Politics & Economics"],
		drafting: ["Mechanical Engineering", "Engineering Sci-Environmental", "Physics (Int.)", "Applied Physics"],
		book: ["Humanities", "English", "History", "A future major"],
	};
	for(const [kind, majors] of Object.entries(groups)) {
		for(const major of majors) assert.equal(getMajorIconKind(major), kind, major);
	}
});
