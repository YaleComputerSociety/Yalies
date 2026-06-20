
import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import { Sequelize, QueryTypes } from "sequelize";
import DirectorySource from "./sources/directory.js";
import { FacebookStudent, EnrichedStudent } from "./types.js";
import { YALE_COLLEGE, YALE_COLLEGE_CODE } from "yalies-shared";

type DbPerson = {
	id: number;
	netid: string | null;
	first_name: string;
	last_name: string;
	college: string | null;
	year: number | null;
	email: string | null;
	upi: number | null;
	phone: string | null;
	mailbox: string | null;
	preferred_name: string | null;
	middle_name: string | null;
	suffix: string | null;
	school: string | null;
	school_code: string | null;
	curriculum: string | null;
	college_code: string | null;
	address: string | null;
};

async function main() {
	const args = process.argv.slice(2);
	const cookieIdx = args.indexOf("--cookie");
	const dryRun = args.includes("--dry-run");

	if (cookieIdx === -1 || !args[cookieIdx + 1]) {
		console.log("Usage: node build/enrichMissing.js --cookie <_people_search_session> [--dry-run]");
		console.log("\nGet the cookie from directory.yale.edu:");
		console.log("  1. Go to https://directory.yale.edu and log in");
		console.log("  2. Open DevTools → Application → Cookies");
		console.log("  3. Copy the value of _people_search_session");
		return;
	}

	const cookie = args[cookieIdx + 1];
	const sequelize = new Sequelize(process.env.DATABASE_URL!, { logging: false });

	try {
		await sequelize.authenticate();
		console.log("Connected to database");

		const missing = await sequelize.query(
			`SELECT id, netid, first_name, last_name, college, year, email, upi, phone, mailbox,
			        preferred_name, middle_name, suffix, school, school_code, curriculum, college_code, address
			 FROM person
			 WHERE (school = :yc OR school_code = :ycCode)
			   AND netid IS NULL
			 ORDER BY last_name, first_name`,
			{ type: QueryTypes.SELECT, replacements: { yc: YALE_COLLEGE, ycCode: YALE_COLLEGE_CODE } },
		) as DbPerson[];

		console.log(`Found ${missing.length} students without netids\n`);

		if (missing.length === 0) {
			console.log("Nothing to do.");
			return;
		}

		const directory = new DirectorySource(cookie);

		const asStudents: (FacebookStudent & { _dbId: number })[] = missing.map(p => ({
			full_name: `${p.first_name} ${p.last_name}`,
			first_name: p.first_name,
			last_name: p.last_name,
			year: p.year ? `'${String(p.year).slice(-2)}` : "",
			pronouns: "",
			college: p.college || "",
			phone: p.phone || undefined,
			address: p.address || undefined,
			photo_id: "0",
			details_raw: "",
			_dbId: p.id,
		}));

		console.log("Starting directory enrichment...\n");
		const enriched = await directory.enrich(asStudents, 300, 50, 0);

		const newlyEnriched = enriched.filter(s => s.netid);
		console.log(`\nEnriched ${newlyEnriched.length} out of ${missing.length} students`);

		if (dryRun) {
			console.log("\nDry run — showing first 20 matches:");
			for (const s of newlyEnriched.slice(0, 20)) {
				console.log(`  ${s.first_name} ${s.last_name} → ${s.netid} (${s.email})`);
			}
			console.log("\nNo changes made. Run without --dry-run to update the database.");
			return;
		}

		console.log("\nUpdating database...");
		let updated = 0;

		for (const student of enriched) {
			const dbId = (student as EnrichedStudent & { _dbId: number })._dbId;

			if (!student.netid) continue;

			const fields: Record<string, unknown> = {
				netid: student.netid,
				id: dbId,
			};

			if (student.email) fields.email = student.email;
			if (student.upi) fields.upi = student.upi;
			if (student.mailbox) fields.mailbox = student.mailbox;
			if (student.phone_directory) fields.phone = student.phone_directory;
			if (student.preferred_name) fields.preferred_name = student.preferred_name;
			if (student.middle_name) fields.middle_name = student.middle_name;
			if (student.suffix) fields.suffix = student.suffix;
			if (student.school) fields.school = student.school;
			if (student.school_code) fields.school_code = student.school_code;
			if (student.year_directory) fields.year = student.year_directory;
			if (student.curriculum) fields.curriculum = student.curriculum;
			if (student.college_code) fields.college_code = student.college_code;
			if (student.college_directory) fields.college = student.college_directory;
			if (student.student_address || student.registered_address) {
				fields.address = student.student_address || student.registered_address;
			}

			const setClauses = Object.keys(fields)
				.filter(k => k !== "id")
				.map(k => `${k} = :${k}`)
				.join(", ");

			await sequelize.query(
				`UPDATE person SET ${setClauses} WHERE id = :id`,
				{ replacements: fields },
			);
			updated++;
		}

		console.log(`Done. Updated ${updated} students.`);

		const [remaining] = await sequelize.query(
			`SELECT COUNT(*) as cnt FROM person
			 WHERE (school = :yc OR school_code = :ycCode) AND netid IS NULL`,
			{ type: QueryTypes.SELECT, replacements: { yc: YALE_COLLEGE, ycCode: YALE_COLLEGE_CODE } },
		) as [{ cnt: string }];
		console.log(`Remaining students without netid: ${remaining.cnt}`);

	} finally {
		await sequelize.close();
	}
}

(async () => {
	try {
		await main();
	} catch (err) {
		console.error("Fatal error:", err);
		process.exit(1);
	}
})();
