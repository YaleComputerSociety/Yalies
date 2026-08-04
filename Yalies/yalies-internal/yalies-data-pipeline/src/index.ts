import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { parseArgs } from "util";
import FacebookSource from "./sources/facebook.js";
import DirectorySource from "./sources/directory.js";
import { loadToDatabase } from "./loadDb.js";
import { runValidation } from "./validate.js";
import { EnrichedStudent, FacebookStudent } from "./types.js";
import {
	mergeBrowserExports,
	readDirectoryBrowserExport,
	readFacebookBrowserExport,
} from "./browserImports.js";

const OUTPUT_DIR = "output";
const FACEBOOK_FILE = `${OUTPUT_DIR}/students.json`;
const ENRICHED_FILE = `${OUTPUT_DIR}/students_enriched.json`;
const LOAD_BLOCK_FILE = `${OUTPUT_DIR}/LOAD_BLOCKED.txt`;

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

function blockLoad(reason: string): void {
	mkdirSync(OUTPUT_DIR, { recursive: true });
	writeFileSync(LOAD_BLOCK_FILE, `${new Date().toISOString()}\n${reason}\n`);
}

function clearLoadBlock(): void {
	if (existsSync(LOAD_BLOCK_FILE)) unlinkSync(LOAD_BLOCK_FILE);
}

async function runFacebook(cookie: string, uploadPhotos = false): Promise<FacebookStudent[]> {
	blockLoad("A new Face Book scrape started; complete and validate Directory enrichment before loading.");
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

async function runLoad(
	databaseUrl: string,
	options: {
		apply: boolean;
		force: boolean;
		confirmationToken?: string;
		targetLabel?: "development" | "production";
	},
): Promise<void> {
	if (existsSync(LOAD_BLOCK_FILE)) {
		throw new Error(`Database load is blocked: ${readFileSync(LOAD_BLOCK_FILE, "utf8").trim()}`);
	}
	const students = loadJson<EnrichedStudent[]>(ENRICHED_FILE);
	console.log(`Loaded ${students.length} students from ${ENRICHED_FILE}`);
	const validationPassed = await runValidation("enriched", { enriched: students });
	if (!validationPassed) {
		throw new Error("Refusing to build or apply a database plan because enriched-data validation failed");
	}
	await loadToDatabase(students, databaseUrl, {
		dryRun: !options.apply,
		force: options.force,
		confirmationToken: options.confirmationToken,
		targetLabel: options.targetLabel,
	});
}

async function runBrowserImport(facebookFile: string, directoryFile: string): Promise<boolean> {
	blockLoad("Browser import has not completed with zero collection errors and passing validation.");
	console.log(`Reading Facebook browser export: ${facebookFile}`);
	const facebook = readFacebookBrowserExport(facebookFile);
	console.log(`Reading Directory browser export: ${directoryFile}`);
	const directory = readDirectoryBrowserExport(directoryFile);
	const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
	for (const [label, exportedAt] of [["Facebook", facebook.exportedAt], ["Directory", directory.exportedAt]]) {
		const timestamp = Date.parse(exportedAt);
		if (!Number.isFinite(timestamp)) throw new Error(`${label} export has an invalid exportedAt timestamp`);
		const age = Date.now() - timestamp;
		if (age < -5 * 60 * 1000) throw new Error(`${label} export timestamp is unexpectedly in the future`);
		if (age > maxAgeMs) throw new Error(`${label} export is over 14 days old; collect a fresh roster before a database run`);
	}
	const result = mergeBrowserExports(facebook, directory);

	saveJson(FACEBOOK_FILE, facebook.students);
	saveJson(ENRICHED_FILE, result.students);
	console.log("\nBrowser import summary:");
	console.log(`  Students: ${result.students.length}`);
	console.log(`  Directory matches: ${result.matched}`);
	console.log(`  Unmatched: ${result.unmatched}`);
	console.log(`  Ambiguous one-to-one matches left unmatched: ${result.ambiguous}`);
	console.log(`  Export errors: ${result.errors}`);

	const validationPassed = await runValidation("enriched", { facebook: facebook.students, enriched: result.students });
	if (result.errors > 0) {
		console.error(`\nBrowser import has ${result.errors} known Directory export errors. Repair the export before continuing.`);
	}
	const ready = validationPassed && result.errors === 0;
	if (ready) clearLoadBlock();
	return ready;
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
			"facebook-cookie-file": { type: "string" },
			"directory-cookie": { type: "string" },
			"database-url": { type: "string" },
			"delay": { type: "string", default: "300" },
			"start-from": { type: "string", default: "0" },
			"dry-run": { type: "boolean", default: false },
			"apply": { type: "boolean", default: false },
			"confirm": { type: "string" },
			"target": { type: "string" },
			"facebook-file": { type: "string" },
			"directory-file": { type: "string" },
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
  browser-import      Merge browser-exported Facebook + Directory JSON
  load                Preview or apply enriched data to the database
  validate [step]     Validate data (steps: facebook, enriched, database, all)

Options:
  --facebook-cookie   Full Cookie header from a verified students.yale.edu request
  --facebook-cookie-file  Path to a file containing that Cookie header (preferred)
  --directory-cookie  _people_search_session cookie for directory.yale.edu (required for directory/all)
  --database-url      PostgreSQL connection URL (or set DATABASE_URL env)
  --facebook-file     Browser Facebook JSON (browser-import)
  --directory-file    Browser Directory JSON (browser-import)
  --delay             Delay between directory API requests in ms (default: 300)
  --start-from        Index to resume directory enrichment from (default: 0)
  --dry-run           Deprecated alias for the default load preview behavior
  --apply             Apply a previously previewed load plan
  --target            Required with --apply: development or production
  --confirm           Exact APPLY-... token printed by the load preview
  --upload-photos     Upload student photos to Google Cloud Storage
  --force             Override only the 80% replacement-size guard (validation still required)
  --help              Show this help message

Examples:
  npm start -- all --facebook-cookie-file /tmp/yalies-facebook-cookie.txt --directory-cookie XYZ789
  npm start -- facebook --facebook-cookie-file /tmp/yalies-facebook-cookie.txt
  npm start -- photos --facebook-cookie-file /tmp/yalies-facebook-cookie.txt
  npm start -- directory --directory-cookie XYZ789 --start-from 1000
  npm start -- browser-import --facebook-file ~/Downloads/yalies-facebook.json --directory-file ~/Downloads/yalies-directory.json
  npm start -- load
  npm start -- load --apply --target production --confirm APPLY-ABC123456789
  npm start -- validate all
`);
		return;
	}

	const knownCommands = new Set(["all", "facebook", "photos", "directory", "browser-import", "load", "validate"]);
	if (!knownCommands.has(command)) {
		console.error(`ERROR: unknown command "${command}". Run with --help for usage.`);
		process.exit(1);
	}

	const databaseUrl = values["database-url"] || process.env.DATABASE_URL || "";
	const delay = parseInt(values.delay || "300");
	const startFrom = parseInt(values["start-from"] || "0");
	if(values["facebook-cookie"] && values["facebook-cookie-file"]) {
		console.error("ERROR: pass either --facebook-cookie or --facebook-cookie-file, not both");
		process.exit(1);
	}
	let facebookCookie = values["facebook-cookie"];
	if(values["facebook-cookie-file"]) {
		try {
			facebookCookie = readFileSync(path.resolve(values["facebook-cookie-file"]), "utf8").trim();
		} catch(error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`ERROR: could not read --facebook-cookie-file: ${message}`);
			process.exit(1);
		}
		if(!facebookCookie) {
			console.error("ERROR: --facebook-cookie-file is empty");
			process.exit(1);
		}
	}

	const validateStep = command === "validate" ? (positionals[1] || "all") : null;
	const needsDb = command === "load" || command === "all"
		|| (command === "validate" && (validateStep === "database" || validateStep === "all"));
	if (needsDb && !databaseUrl) {
		console.error("ERROR: no database URL. Set DATABASE_URL in your env or pass --database-url <url>");
		process.exit(1);
	}

	const target = values.target;
	if (target && target !== "development" && target !== "production") {
		console.error("ERROR: --target must be development or production");
		process.exit(1);
	}
	if (values.apply && !target) {
		console.error("ERROR: --apply requires --target development or --target production");
		process.exit(1);
	}
	if (values.apply && target) {
		const proxyEnvPath = path.resolve(process.cwd(), "../../../.config/.env.proxy");
		if (existsSync(proxyEnvPath)) {
			const proxyEnv = readFileSync(proxyEnvPath, "utf8");
			const configuredMode = proxyEnv.match(/^DEV_MODE=["']?(development|production)["']?\s*$/m)?.[1];
			if (configuredMode && configuredMode !== target) {
				console.error(
					`ERROR: --target ${target} conflicts with DEV_MODE=${configuredMode} in ${proxyEnvPath}. ` +
					"Change the proxy configuration and restart the Cloud SQL proxy before applying.",
				);
				process.exit(1);
			}
		}
	}
	if (values.apply && !values.confirm) {
		console.error("ERROR: --apply requires the APPLY-... token printed by a fresh load preview via --confirm");
		process.exit(1);
	}
	if (values["dry-run"] && values.apply) {
		console.error("ERROR: --dry-run and --apply cannot be used together");
		process.exit(1);
	}
	if (values.force && !values.apply) {
		console.error("ERROR: --force is only meaningful with --apply");
		process.exit(1);
	}

	if (command === "browser-import") {
		const facebookFile = values["facebook-file"];
		const directoryFile = values["directory-file"];
		if (!facebookFile || !directoryFile) {
			console.error("ERROR: browser-import requires --facebook-file and --directory-file");
			process.exit(1);
		}
		const passed = await runBrowserImport(facebookFile, directoryFile);
		if (!passed) {
			console.error("\nBrowser import validation failed. The database was not touched.");
			process.exit(1);
		}
		console.log("\nBrowser exports imported and validated. Run `npm start -- load` to preview the database plan.");
	}

	if (command === "facebook" || command === "all") {
		const cookie = facebookCookie;
		if (!cookie) {
			console.error("ERROR: --facebook-cookie or --facebook-cookie-file is required");
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
		const cookie = facebookCookie;
		if (!cookie) {
			console.error("ERROR: --facebook-cookie or --facebook-cookie-file is required");
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
			if (command === "all") {
				console.error("Aborting before load. Validation failures cannot be overridden.");
				process.exit(1);
			}
		} else {
			clearLoadBlock();
		}
		console.log(`\nDirectory enrichment complete: ${enriched.filter((s) => s.netid).length} enriched`);
	}

	if (command === "load" || command === "all") {
		await runLoad(databaseUrl, {
			apply: values.apply || false,
			force: values.force || false,
			confirmationToken: values.confirm,
			targetLabel: target as "development" | "production" | undefined,
		});
		if (values.apply) {
			const passed = await runValidate("database", databaseUrl);
			if (!passed) {
				console.error("\nDatabase validation failed. Use the recovery table printed above to restore the prior roster.");
				process.exit(1);
			}
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
