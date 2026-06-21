import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { parseArgs } from "util";
import FacebookSource from "./sources/facebook.js";
import DirectorySource from "./sources/directory.js";
import { loadToDatabase } from "./loadDb.js";
import { runValidation } from "./validate.js";
import { EnrichedStudent, FacebookStudent } from "./types.js";

const OUTPUT_DIR = "output";
const FACEBOOK_FILE = `${OUTPUT_DIR}/students.json`;
const ENRICHED_FILE = `${OUTPUT_DIR}/students_enriched.json`;

function saveJson(path: string, data: unknown): void {
	mkdirSync(OUTPUT_DIR, { recursive: true });
	writeFileSync(path, JSON.stringify(data, null, 2));
	console.log(`Saved to ${path}`);
}

function loadJson<T>(path: string): T {
	if (!existsSync(path)) {
		throw new Error(`File not found: ${path}`);
	}
	return JSON.parse(readFileSync(path, "utf-8")) as T;
}

async function runFacebook(cookie: string, uploadPhotos = false): Promise<FacebookStudent[]> {
	const source = new FacebookSource(cookie);
	const students = await source.scrape();
	saveJson(FACEBOOK_FILE, students);
	if (uploadPhotos) {
		await source.uploadPhotos(students);
	}
	return students;
}

async function runDirectory(
	sessionCookie: string,
	delay: number,
	startFrom: number,
): Promise<EnrichedStudent[]> {
	const students = loadJson<FacebookStudent[]>(FACEBOOK_FILE);
	console.log(`Loaded ${students.length} students from ${FACEBOOK_FILE}`);

	const source = new DirectorySource(sessionCookie);
	const enriched = await source.enrich(
		students,
		delay,
		50,
		startFrom,
		(data) => saveJson(ENRICHED_FILE, data),
	);

	saveJson(ENRICHED_FILE, enriched);
	return enriched;
}

async function runPhotos(cookie: string): Promise<void> {
	const students = loadJson<FacebookStudent[]>(FACEBOOK_FILE);
	console.log(`Loaded ${students.length} students from ${FACEBOOK_FILE}`);
	const source = new FacebookSource(cookie);
	const uploaded = await source.uploadPhotos(students);
	console.log(`Done. ${uploaded} new photos uploaded.`);
}

async function runLoad(databaseUrl: string, dryRun: boolean, force: boolean): Promise<void> {
	const students = loadJson<EnrichedStudent[]>(ENRICHED_FILE);
	console.log(`Loaded ${students.length} students from ${ENRICHED_FILE}`);
	await loadToDatabase(students, databaseUrl, dryRun, force);
}

async function runValidate(step: string, databaseUrl: string): Promise<boolean> {
	const facebook = existsSync(FACEBOOK_FILE) ? loadJson<FacebookStudent[]>(FACEBOOK_FILE) : undefined;
	const enriched = existsSync(ENRICHED_FILE) ? loadJson<EnrichedStudent[]>(ENRICHED_FILE) : undefined;

	return await runValidation(
		step as "facebook" | "enriched" | "database" | "all",
		{ facebook, enriched, databaseUrl },
	);
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			"facebook-cookie": { type: "string" },
			"directory-cookie": { type: "string" },
			"database-url": { type: "string" },
			"delay": { type: "string", default: "300" },
			"start-from": { type: "string", default: "0" },
			"dry-run": { type: "boolean", default: false },
			"upload-photos": { type: "boolean", default: false },
			"force": { type: "boolean", default: false },
			"help": { type: "boolean", default: false },
		},
	});

	const command = positionals[0];

	if (values.help || !command) {
		console.log(`Yale Scraper — Data pipeline for Yalies

Usage: npm start -- <command> [options]

Commands:
  all                 Run full pipeline (facebook → directory → load → validate)
  facebook            Scrape Yale Facebook directory
  photos              Upload remaining photos to GCS from existing scrape data
  directory           Enrich with Yale Directory API data
  load                Load enriched data into database
  validate [step]     Validate data (steps: facebook, enriched, database, all)

Options:
  --facebook-cookie   JSESSIONID cookie for students.yale.edu (required for facebook/all)
  --directory-cookie  _people_search_session cookie for directory.yale.edu (required for directory/all)
  --database-url      PostgreSQL connection URL (or set DATABASE_URL env)
  --delay             Delay between directory API requests in ms (default: 300)
  --start-from        Index to resume directory enrichment from (default: 0)
  --dry-run           Preview database changes without writing
  --upload-photos     Upload student photos to Google Cloud Storage
  --force             Skip safety guards (small-sync guard + validation gate)
  --help              Show this help message

Examples:
  npm start -- all --facebook-cookie ABC123 --directory-cookie XYZ789
  npm start -- facebook --facebook-cookie ABC123
  npm start -- directory --directory-cookie XYZ789 --start-from 1000
  npm start -- load --dry-run
  npm start -- validate all
`);
		return;
	}

	const databaseUrl = values["database-url"] || process.env.DATABASE_URL || "";
	const delay = parseInt(values.delay || "300");
	const startFrom = parseInt(values["start-from"] || "0");

	const validateStep = command === "validate" ? (positionals[1] || "all") : null;
	const needsDb = command === "load" || command === "all"
		|| (command === "validate" && (validateStep === "database" || validateStep === "all"));
	if (needsDb && !databaseUrl) {
		console.error("ERROR: no database URL. Set DATABASE_URL in your env or pass --database-url <url>");
		process.exit(1);
	}

	if (command === "facebook" || command === "all") {
		const cookie = values["facebook-cookie"];
		if (!cookie) {
			console.error("ERROR: --facebook-cookie is required");
			process.exit(1);
		}
		const students = await runFacebook(cookie, values["upload-photos"] || false);
		const passed = await runValidate("facebook", databaseUrl);
		if (!passed) {
			console.error("\nFacebook validation failed. Fix issues before continuing.");
			if (command === "all") process.exit(1);
		}
		console.log(`\nFacebook scrape complete: ${students.length} students`);
	}

	if (command === "photos") {
		const cookie = values["facebook-cookie"];
		if (!cookie) {
			console.error("ERROR: --facebook-cookie is required");
			process.exit(1);
		}
		await runPhotos(cookie);
	}

	if (command === "directory" || command === "all") {
		const cookie = values["directory-cookie"];
		if (!cookie) {
			console.error("ERROR: --directory-cookie is required");
			process.exit(1);
		}
		const enriched = await runDirectory(cookie, delay, startFrom);
		const passed = await runValidate("enriched", databaseUrl);
		if (!passed) {
			console.error("\nEnrichment validation failed. Review warnings above.");
			if (command === "all" && !values.force) {
				console.error("Aborting before load. Re-run with --force to load anyway.");
				process.exit(1);
			}
			if (command === "all") console.log("Continuing to load despite warnings (--force)...");
		}
		console.log(`\nDirectory enrichment complete: ${enriched.filter((s) => s.netid).length} enriched`);
	}

	if (command === "load" || command === "all") {
		await runLoad(databaseUrl, values["dry-run"] || false, values.force || false);
		const passed = await runValidate("database", databaseUrl);
		if (!passed) {
			console.error("\nDatabase validation failed.");
			process.exit(1);
		}
	}

	if (command === "validate") {
		const step = positionals[1] || "all";
		const passed = await runValidate(step, databaseUrl);
		process.exit(passed ? 0 : 1);
	}
}

(async () => {
	try {
		await main();
	} catch (e) {
		console.error("Fatal error:", e);
		process.exit(1);
	}
})();
