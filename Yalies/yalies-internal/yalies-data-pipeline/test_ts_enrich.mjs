// Test TypeScript directory enrichment on first 100 students
import { readFileSync, writeFileSync } from "fs";
import DirectorySource from "./build/sources/directory.js";

const COOKIE = process.argv[2];
const COUNT = parseInt(process.argv[3] || "100");

const students = JSON.parse(readFileSync("output/students.json", "utf-8")).slice(0, COUNT);
console.log(`TS: Enriching ${students.length} students...`);

const source = new DirectorySource(COOKIE);
await source.fetchCsrfToken();

let enriched = 0;
let notFound = 0;

for (let i = 0; i < students.length; i++) {
	const s = students[i];
	if (!s.first_name || !s.last_name) { notFound++; continue; }

	try {
		const records = await source.searchPerson(s.first_name, s.last_name);
		if (records.length > 0) {
			const rec = records[0];
			const mapping = {
				netid: "NetId", email: "EmailAddress", upi: "UPI",
				mailbox: "MailBox", phone_directory: "PhoneNumber",
				first_name_directory: "FirstName", preferred_name: "KnownAs",
				middle_name: "MiddleName", suffix: "Suffix",
				school: "PrimarySchoolName", school_code: "PrimarySchoolCode",
				year_directory: "StudentExpectedGraduationYear",
				college_code: "ResidentialCollegeCode",
				college_directory: "ResidentialCollegeName",
				organization: "OrganizationName",
			};
			for (const [k, v] of Object.entries(mapping)) {
				if (rec[v] && String(rec[v]).trim()) students[i][k] = rec[v];
			}
			enriched++;
		} else {
			notFound++;
		}
	} catch (e) {
		notFound++;
	}

	if ((i + 1) % 10 === 0) process.stdout.write(`TS: ${i + 1}/${students.length}\r`);

	await new Promise(r => setTimeout(r, 300));
}

console.log(`\nTS: Done. enriched=${enriched} notFound=${notFound}`);
writeFileSync("output/test_ts_enriched.json", JSON.stringify(students, null, 2));
console.log("TS: Saved output/test_ts_enriched.json");
