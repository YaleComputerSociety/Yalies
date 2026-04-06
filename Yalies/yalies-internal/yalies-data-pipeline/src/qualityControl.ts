/**
 * Post-scrape data quality control.
 * Detects and fixes misplaced data, validates field formats, produces a report.
 *
 * Usage:
 *   npx tsc && node build/qualityControl.js [--dry-run] [--fix]
 */

import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import { Sequelize, QueryTypes } from "sequelize";
import {
	YALE_COLLEGE,
	YALE_COLLEGE_CODE,
	VALID_COLLEGES,
	EXPECTED_YEARS,
	US_STATES,
	COUNTRY_ALIASES,
	parseLocation,
} from "yalies-shared";

// ----- Known data lists -----

const KNOWN_COUNTRIES = new Set([
	...Object.values(COUNTRY_ALIASES),
	"Romania", "Brazil", "Indonesia", "Japan", "Mongolia", "Morocco", "Ukraine",
	"China", "India", "South Korea", "Taiwan", "Hong Kong", "Singapore", "Malaysia",
	"Vietnam", "Thailand", "Philippines", "Cambodia", "Myanmar", "Nepal", "Sri Lanka",
	"Bangladesh", "Pakistan", "Iran", "Iraq", "Israel", "Turkey", "Saudi Arabia",
	"United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman", "Yemen", "Jordan",
	"Lebanon", "Syria", "Egypt", "Nigeria", "Ghana", "Kenya", "South Africa",
	"Ethiopia", "Tanzania", "Uganda", "Rwanda", "Morocco", "Tunisia", "Algeria",
	"Zimbabwe", "Mexico", "Canada", "Brazil", "Colombia", "Argentina", "Peru",
	"Chile", "Ecuador", "Venezuela", "Bolivia", "Paraguay", "Uruguay", "Cuba",
	"Jamaica", "Haiti", "Dominican Republic", "Trinidad", "Guatemala", "Honduras",
	"Costa Rica", "Panama", "Bermuda", "Barbados", "Germany", "France", "Italy",
	"Spain", "Portugal", "Netherlands", "Belgium", "Austria", "Switzerland",
	"Sweden", "Norway", "Denmark", "Finland", "Ireland", "Poland", "Hungary",
	"Czech Republic", "Greece", "Russia", "Ukraine", "Australia", "New Zealand",
	"Georgia", "Armenia", "Azerbaijan", "Kazakhstan", "Uzbekistan", "Mongolia",
]);

const US_CITY_STATE_REGEX = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}$/;

const VALID_COLLEGES_SET = new Set<string>(VALID_COLLEGES);
const EXPECTED_YEARS_SET = new Set<number>(EXPECTED_YEARS);

// ----- Types -----

type Issue = {
	id: number;
	netid: string | null;
	name: string;
	field: string;
	problem: string;
	current_value: string | null;
	suggested_fix: string | null;
};

type Fix = {
	id: number;
	field: string;
	old_value: string | null;
	new_value: string | null;
};

// ----- QC checks -----

function checkCountryInMajor(row: Record<string, unknown>): Issue | null {
	const major = row.major as string | null;
	if (!major) return null;
	const lower = major.toLowerCase();
	for (const country of KNOWN_COUNTRIES) {
		if (country.toLowerCase() === lower) {
			return {
				id: row.id as number,
				netid: row.netid as string | null,
				name: `${row.first_name} ${row.last_name}`,
				field: "major",
				problem: `Major contains country name "${major}" instead of actual major`,
				current_value: major,
				suggested_fix: `Move "${major}" to address_country, set major to NULL`,
			};
		}
	}
	return null;
}

function checkCityStateInMajor(row: Record<string, unknown>): Issue | null {
	const major = row.major as string | null;
	if (!major) return null;
	if (US_CITY_STATE_REGEX.test(major)) {
		return {
			id: row.id as number,
			netid: row.netid as string | null,
			name: `${row.first_name} ${row.last_name}`,
			field: "major",
			problem: `Major contains US city/state "${major}" instead of actual major`,
			current_value: major,
			suggested_fix: `Move "${major}" to address, set major to NULL`,
		};
	}
	return null;
}

function checkStateOnlyAddress(row: Record<string, unknown>): Issue | null {
	const address = row.address as string | null;
	const existingState = row.address_state as string | null;
	if (!address || address.length > 3) return null;
	if (existingState) return null; // already fixed
	const upper = address.toUpperCase().trim();
	if (US_STATES[upper]) {
		return {
			id: row.id as number,
			netid: row.netid as string | null,
			name: `${row.first_name} ${row.last_name}`,
			field: "address",
			problem: `Address is only a state code "${address}"`,
			current_value: address,
			suggested_fix: `Set address_state to "${upper}", address_country to "United States"`,
		};
	}
	return null;
}

function checkUnparsedAddress(row: Record<string, unknown>): Issue | null {
	const address = row.address as string | null;
	const country = row.address_country as string | null;
	const state = row.address_state as string | null;
	if (!address || country || state) return null;
	const parsed = parseLocation(address);
	// Normalize "Korea, South" → "South Korea" etc
	let parsedCountry = parsed.address_country;
	if (parsedCountry) {
		const comma = parsedCountry.indexOf(", ");
		if (comma > 0) {
			parsedCountry = parsedCountry.substring(comma + 2) + " " + parsedCountry.substring(0, comma);
		}
	}
	if (parsedCountry || parsed.address_state) {
		return {
			id: row.id as number,
			netid: row.netid as string | null,
			name: `${row.first_name} ${row.last_name}`,
			field: "address_country",
			problem: `Address could be parsed but wasn't`,
			current_value: address,
			suggested_fix: `Set address_country="${parsedCountry}", address_state="${parsed.address_state}"`,
		};
	}
	return null;
}

function checkInvalidCollege(row: Record<string, unknown>): Issue | null {
	const college = row.college as string | null;
	if (!college) return null;
	if (!VALID_COLLEGES_SET.has(college)) {
		return {
			id: row.id as number,
			netid: row.netid as string | null,
			name: `${row.first_name} ${row.last_name}`,
			field: "college",
			problem: `Unknown college "${college}"`,
			current_value: college,
			suggested_fix: null,
		};
	}
	return null;
}

function checkInvalidYear(row: Record<string, unknown>): Issue | null {
	const year = row.year as number | null;
	if (!year) return null;
	if (!EXPECTED_YEARS_SET.has(year) && year !== 2025 && year !== 2030) {
		return {
			id: row.id as number,
			netid: row.netid as string | null,
			name: `${row.first_name} ${row.last_name}`,
			field: "year",
			problem: `Unexpected graduation year ${year}`,
			current_value: String(year),
			suggested_fix: null,
		};
	}
	return null;
}

// ----- Fix application -----

function computeFixes(issues: Issue[]): Fix[] {
	const fixes: Fix[] = [];

	for (const issue of issues) {
		if (issue.field === "major" && issue.problem.includes("country name")) {
			const country = issue.current_value!;
			fixes.push(
				{ id: issue.id, field: "address_country", old_value: null, new_value: country },
				{ id: issue.id, field: "major", old_value: country, new_value: null },
			);
		}

		if (issue.field === "major" && issue.problem.includes("city/state")) {
			const cityState = issue.current_value!;
			const parsed = parseLocation(cityState);
			fixes.push(
				{ id: issue.id, field: "address", old_value: null, new_value: cityState },
				{ id: issue.id, field: "major", old_value: cityState, new_value: null },
			);
			if (parsed.address_state) {
				fixes.push({ id: issue.id, field: "address_state", old_value: null, new_value: parsed.address_state });
			}
			if (parsed.address_country) {
				fixes.push({ id: issue.id, field: "address_country", old_value: null, new_value: parsed.address_country });
			}
		}

		if (issue.field === "address" && issue.problem.includes("state code")) {
			const state = issue.current_value!.toUpperCase().trim();
			fixes.push(
				{ id: issue.id, field: "address_state", old_value: null, new_value: state },
				{ id: issue.id, field: "address_country", old_value: null, new_value: "United States" },
			);
		}

		if (issue.field === "address_country" && issue.problem.includes("could be parsed")) {
			const address = issue.current_value;
			const parsed = parseLocation(address);
			let parsedCountry = parsed.address_country;
			if (parsedCountry) {
				const comma = parsedCountry.indexOf(", ");
				if (comma > 0) {
					parsedCountry = parsedCountry.substring(comma + 2) + " " + parsedCountry.substring(0, comma);
				}
				fixes.push({ id: issue.id, field: "address_country", old_value: null, new_value: parsedCountry });
			}
			if (parsed.address_state) {
				fixes.push({ id: issue.id, field: "address_state", old_value: null, new_value: parsed.address_state });
			}
		}
	}

	return fixes;
}

async function applyFixes(sequelize: Sequelize, fixes: Fix[]): Promise<number> {
	// Group fixes by id
	const byId = new Map<number, Fix[]>();
	for (const fix of fixes) {
		if (!byId.has(fix.id)) byId.set(fix.id, []);
		byId.get(fix.id)!.push(fix);
	}

	let applied = 0;
	for (const [id, idFixes] of byId) {
		const sets: string[] = [];
		const replacements: Record<string, unknown> = { id };

		for (const fix of idFixes) {
			sets.push(`${fix.field} = :${fix.field}`);
			replacements[fix.field] = fix.new_value;
		}

		await sequelize.query(
			`UPDATE person SET ${sets.join(", ")} WHERE id = :id`,
			{ replacements },
		);
		applied++;
	}

	return applied;
}

// ----- Main -----

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const doFix = args.includes("--fix");

	if (!dryRun && !doFix) {
		console.log("Usage: node build/qualityControl.js [--dry-run | --fix]");
		console.log("  --dry-run  Scan and report issues without changing anything");
		console.log("  --fix      Scan, report, and apply fixes");
		return;
	}

	const sequelize = new Sequelize(process.env.DATABASE_URL!, { logging: false });

	try {
		await sequelize.authenticate();
		console.log("Connected to database\n");

		const people = await sequelize.query(
			`SELECT id, netid, first_name, last_name, major, address, address_state, address_country, college, year
			 FROM person WHERE school = '${YALE_COLLEGE}' OR school_code = '${YALE_COLLEGE_CODE}'`,
			{ type: QueryTypes.SELECT },
		) as unknown as Record<string, unknown>[];
		console.log(`Scanning ${people.length} students...\n`);

		const issues: Issue[] = [];
		for (const row of people) {
			const checks = [
				checkCountryInMajor(row),
				checkCityStateInMajor(row),
				checkStateOnlyAddress(row),
				checkUnparsedAddress(row),
				checkInvalidCollege(row),
				checkInvalidYear(row),
			];
			for (const issue of checks) {
				if (issue) issues.push(issue);
			}
		}

		// Report
		const byType = new Map<string, Issue[]>();
		for (const issue of issues) {
			const key = issue.problem.split('"')[0].trim();
			if (!byType.has(key)) byType.set(key, []);
			byType.get(key)!.push(issue);
		}

		console.log("=" .repeat(60));
		console.log(`  DATA QUALITY REPORT — ${issues.length} issues found`);
		console.log("=".repeat(60));

		for (const [type, typeIssues] of byType) {
			console.log(`\n  ${type} (${typeIssues.length})`);
			for (const issue of typeIssues.slice(0, 10)) {
				console.log(`    ${issue.name} (${issue.netid}): ${issue.current_value}`);
				if (issue.suggested_fix) console.log(`      → ${issue.suggested_fix}`);
			}
			if (typeIssues.length > 10) {
				console.log(`    ... and ${typeIssues.length - 10} more`);
			}
		}

		// Fixes
		const fixes = computeFixes(issues);
		const fixableCount = new Set(fixes.map(f => f.id)).size;
		console.log(`\n${"=".repeat(60)}`);
		console.log(`  ${fixableCount} students can be auto-fixed (${fixes.length} field updates)`);
		console.log("=".repeat(60));

		if (doFix && fixes.length > 0) {
			console.log("\nApplying fixes...");
			const applied = await applyFixes(sequelize, fixes);
			console.log(`Done. Updated ${applied} students.`);
		} else if (dryRun) {
			console.log("\nDry run — no changes made. Use --fix to apply.");
		}

	} finally {
		await sequelize.close();
	}
}

main().catch(err => {
	console.error("Fatal error:", err);
	process.exit(1);
});
