import { Sequelize, QueryTypes } from "sequelize";
import { FacebookStudent, EnrichedStudent, ValidationResult } from "./types.js";
import {
	VALID_COLLEGES,
	EXPECTED_YEARS,
	YALE_EMAIL_REGEX,
	NETID_REGEX,
	VALIDATION_THRESHOLDS,
	YALE_COLLEGE,
} from "yalies-shared";

const {
	MIN_TOTAL_STUDENTS,
	MAX_TOTAL_STUDENTS,
	MIN_ENRICHMENT_RATE,
	MIN_COLLEGES,
	MIN_STUDENTS_PER_YEAR,
	MIN_STUDENTS_PER_COLLEGE,
} = VALIDATION_THRESHOLDS;

const VALID_COLLEGES_SET = new Set<string>(VALID_COLLEGES);
const EXPECTED_YEARS_SET = new Set<number>(EXPECTED_YEARS);

function createResult(): ValidationResult {
	return { passes: [], warnings: [], failures: [] };
}

function reportResult(result: ValidationResult, title: string): boolean {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`  ${title}`);
	console.log(`${"=".repeat(60)}`);
	for (const msg of result.passes) console.log(`  PASS  ${msg}`);
	for (const msg of result.warnings) console.log(`  WARN  ${msg}`);
	for (const msg of result.failures) console.log(`  FAIL  ${msg}`);
	console.log(`\n  Total: ${result.passes.length} passed, ${result.warnings.length} warnings, ${result.failures.length} failures`);
	return result.failures.length === 0;
}

export function validateFacebook(data: FacebookStudent[]): ValidationResult {
	const result = createResult();
	const n = data.length;

	// 1. Total count
	if (n >= MIN_TOTAL_STUDENTS && n <= MAX_TOTAL_STUDENTS) {
		result.passes.push(`Student count: ${n} (expected ${MIN_TOTAL_STUDENTS}-${MAX_TOTAL_STUDENTS})`);
	} else {
		result.failures.push(`Student count: ${n} (expected ${MIN_TOTAL_STUDENTS}-${MAX_TOTAL_STUDENTS})`);
	}

	// 2. Required fields
	for (const [field, label] of [["full_name", "Name"], ["year", "Year"], ["college", "College"], ["photo_id", "Photo ID"]] as const) {
		const missing = data.filter((s) => !s[field]).length;
		const pct = (missing / n) * 100;
		if (pct === 0) result.passes.push(`${label}: 100% populated`);
		else if (pct < 2) result.warnings.push(`${label}: ${missing}/${n} missing (${pct.toFixed(1)}%)`);
		else result.failures.push(`${label}: ${missing}/${n} missing (${pct.toFixed(1)}%)`);
	}

	// 3. Optional fields
	for (const [field, label, minPct] of [["major", "Major", 80], ["birthday", "Birthday", 80], ["address", "Address", 70], ["phone", "Phone", 20]] as const) {
		const present = data.filter((s) => s[field as keyof FacebookStudent]).length;
		const pct = (present / n) * 100;
		if (pct >= (minPct as number)) {
			result.passes.push(`${label}: ${present}/${n} (${pct.toFixed(1)}%) — above ${minPct}% threshold`);
		} else {
			result.warnings.push(`${label}: ${present}/${n} (${pct.toFixed(1)}%) — below ${minPct}% threshold`);
		}
	}

	// 4. College distribution
	const colleges: Record<string, number> = {};
	for (const s of data) {
		const c = s.college || "MISSING";
		colleges[c] = (colleges[c] || 0) + 1;
	}

	const knownColleges = Object.keys(colleges).filter((c) => VALID_COLLEGES_SET.has(c));
	const unknownColleges = Object.keys(colleges).filter((c) => !VALID_COLLEGES_SET.has(c) && c !== "MISSING");

	if (knownColleges.length >= MIN_COLLEGES) {
		result.passes.push(`Colleges: ${knownColleges.length}/${MIN_COLLEGES} known residential colleges found`);
	} else {
		const missing = [...VALID_COLLEGES_SET].filter((c) => !knownColleges.includes(c));
		result.failures.push(`Colleges: only ${knownColleges.length}/${MIN_COLLEGES} — missing: ${missing.join(", ")}`);
	}

	if (unknownColleges.length > 0) {
		result.warnings.push(`Unknown colleges found: ${unknownColleges.join(", ")}`);
	}

	for (const [college, count] of Object.entries(colleges)) {
		if (VALID_COLLEGES_SET.has(college) && count < MIN_STUDENTS_PER_COLLEGE) {
			result.warnings.push(`  ${college}: only ${count} students (expected >=${MIN_STUDENTS_PER_COLLEGE})`);
		}
	}

	// 5. Year distribution
	const years: Record<number, number> = {};
	for (const s of data) {
		const match = s.year?.match(/^'(\d{2})$/);
		if (match) {
			const y = 2000 + parseInt(match[1]);
			years[y] = (years[y] || 0) + 1;
		}
	}

	for (const y of EXPECTED_YEARS_SET) {
		const count = years[y] || 0;
		if (count >= MIN_STUDENTS_PER_YEAR) result.passes.push(`Year ${y}: ${count} students`);
		else if (count > 0) result.warnings.push(`Year ${y}: only ${count} students (expected >=${MIN_STUDENTS_PER_YEAR})`);
		else result.failures.push(`Year ${y}: 0 students found`);
	}

	for (const [y, count] of Object.entries(years)) {
		if (!EXPECTED_YEARS_SET.has(parseInt(y))) {
			result.warnings.push(`Unexpected year ${y}: ${count} students`);
		}
	}

	// 6. Duplicates
	const nameCounts: Record<string, number> = {};
	for (const s of data) {
		const name = s.full_name || "";
		nameCounts[name] = (nameCounts[name] || 0) + 1;
	}
	const dupes = Object.entries(nameCounts).filter(([, c]) => c > 1);
	if (dupes.length <= 20) {
		result.passes.push(`Duplicates: ${dupes.length} duplicate names (likely legitimate)`);
	} else {
		const top = dupes.slice(0, 5).map(([name, count]) => `${name}(${count})`).join(", ");
		result.warnings.push(`Duplicates: ${dupes.length} duplicate names — top: ${top}`);
	}

	// 7. HTML entities
	const htmlEntities = data.filter((s) => s.major && (s.major.includes("&amp;") || s.major.includes("&lt;"))).length;
	if (htmlEntities === 0) result.passes.push("HTML entities: none found in major field");
	else result.failures.push(`HTML entities: ${htmlEntities} students have unescaped HTML in major`);

	// 8. Photos
	const noPhoto = data.filter((s) => s.photo_id === "0").length;
	result.passes.push(`Photos: ${n - noPhoto}/${n} have photos (${noPhoto} with id=0)`);

	return result;
}

export function validateEnriched(data: EnrichedStudent[]): ValidationResult {
	const result = createResult();
	const n = data.length;

	// 1. Enrichment rate
	const withNetid = data.filter((s) => s.netid).length;
	const rate = withNetid / n;
	if (rate >= MIN_ENRICHMENT_RATE) {
		result.passes.push(`Enrichment rate: ${withNetid}/${n} (${(rate * 100).toFixed(1)}%) — above ${MIN_ENRICHMENT_RATE * 100}% threshold`);
	} else {
		result.failures.push(`Enrichment rate: ${withNetid}/${n} (${(rate * 100).toFixed(1)}%) — below ${MIN_ENRICHMENT_RATE * 100}% threshold`);
	}

	// 2. Key enriched fields
	const enrichedFields: [string, string][] = [
		["netid", "NetID"], ["email", "Email"], ["upi", "UPI"],
		["school_code", "School Code"], ["college_code", "College Code"],
		["year_directory", "Grad Year"], ["mailbox", "Mailbox"],
	];

	for (const [field, label] of enrichedFields) {
		const present = data.filter((s) => (s as Record<string, unknown>)[field]).length;
		const pct = (present / n) * 100;
		if (pct >= MIN_ENRICHMENT_RATE * 100) result.passes.push(`${label}: ${present}/${n} (${pct.toFixed(1)}%)`);
		else if (pct >= 80) result.warnings.push(`${label}: ${present}/${n} (${pct.toFixed(1)}%)`);
		else result.failures.push(`${label}: ${present}/${n} (${pct.toFixed(1)}%)`);
	}

	// 3. Email format
	const badEmails = data.filter((s) => s.email && !YALE_EMAIL_REGEX.test(s.email));
	if (badEmails.length === 0) result.passes.push("Email format: all emails match *@*.yale.edu");
	else result.failures.push(`Email format: ${badEmails.length} invalid emails — e.g. ${badEmails.slice(0, 3).map((s) => s.email).join(", ")}`);

	// 4. NetID format
	const badNetids = data.filter((s) => s.netid && !NETID_REGEX.test(s.netid));
	if (badNetids.length === 0) result.passes.push("NetID format: all netids match expected pattern");
	else result.warnings.push(`NetID format: ${badNetids.length} unusual netids — e.g. ${badNetids.slice(0, 5).map((s) => s.netid).join(", ")}`);

	// 5. UPI format
	const badUpis = data.filter((s) => s.upi && typeof s.upi !== "number").length;
	if (badUpis === 0) result.passes.push("UPI format: all UPIs are integers");
	else result.failures.push(`UPI format: ${badUpis} non-integer UPIs`);

	// 6. College consistency
	const mismatched = data.filter((s) => {
		const fb = s.college?.toLowerCase() || "";
		const dir = s.college_directory?.toLowerCase() || "";
		return fb && dir && fb !== dir;
	}).length;
	if (mismatched === 0) result.passes.push("College consistency: facebook and directory colleges match");
	else if (mismatched < 20) result.warnings.push(`College consistency: ${mismatched} mismatches`);
	else result.failures.push(`College consistency: ${mismatched} mismatches`);

	// 7. Not-found students
	const notEnriched = data.filter((s) => !s.netid);
	if (notEnriched.length < n * 0.10) {
		result.passes.push(`Not found: ${notEnriched.length} students (${((notEnriched.length / n) * 100).toFixed(1)}%)`);
	} else {
		result.failures.push(`Not found: ${notEnriched.length} students (${((notEnriched.length / n) * 100).toFixed(1)}%)`);
	}

	if (notEnriched.length > 0) {
		const examples = notEnriched.slice(0, 5).map((s) => s.full_name).join(", ");
		result.warnings.push(`Not-found examples: ${examples}`);
	}

	return result;
}

export async function validateDatabase(databaseUrl: string): Promise<ValidationResult> {
	const result = createResult();
	const sequelize = new Sequelize(databaseUrl, { logging: false });

	try {
		await sequelize.authenticate();

		const query = async (sql: string) => {
			const [rows] = await sequelize.query<{ count: string }>(sql, { type: QueryTypes.SELECT });
			return parseInt(rows.count);
		};

		// 1. Total counts
		const total = await query("SELECT COUNT(*) as count FROM person");
		const yc = await query(`SELECT COUNT(*) as count FROM person WHERE school = '${YALE_COLLEGE}'`);
		result.passes.push(`Total rows: ${total}, ${YALE_COLLEGE}: ${yc}`);

		// 2. YC count in range
		if (yc >= MIN_TOTAL_STUDENTS && yc <= MAX_TOTAL_STUDENTS) {
			result.passes.push(`YC count ${yc} in expected range`);
		} else {
			result.failures.push(`YC count ${yc} outside expected range ${MIN_TOTAL_STUDENTS}-${MAX_TOTAL_STUDENTS}`);
		}

		// 3. Null checks
		for (const col of ["first_name", "last_name"]) {
			const nulls = await query(`SELECT COUNT(*) as count FROM person WHERE school = '${YALE_COLLEGE}' AND ${col} IS NULL`);
			if (nulls === 0) result.passes.push(`DB ${col}: no nulls`);
			else result.failures.push(`DB ${col}: ${nulls} null values`);
		}

		// 4. NetID coverage
		const withNetid = await query(`SELECT COUNT(*) as count FROM person WHERE school = '${YALE_COLLEGE}' AND netid IS NOT NULL`);
		const rate = withNetid / yc;
		if (rate >= MIN_ENRICHMENT_RATE) {
			result.passes.push(`DB netid coverage: ${withNetid}/${yc} (${(rate * 100).toFixed(1)}%)`);
		} else {
			result.failures.push(`DB netid coverage: ${withNetid}/${yc} (${(rate * 100).toFixed(1)}%)`);
		}

		// 5. Duplicate netids
		const [dupNetids] = await sequelize.query(
			"SELECT netid, COUNT(*) as count FROM person WHERE netid IS NOT NULL GROUP BY netid HAVING COUNT(*) > 1",
		);
		if ((dupNetids as unknown[]).length === 0) result.passes.push("DB netid uniqueness: no duplicates");
		else result.failures.push(`DB duplicate netids: ${(dupNetids as unknown[]).length}`);

		// 6. Duplicate IDs
		const [dupIds] = await sequelize.query(
			"SELECT id, COUNT(*) as count FROM person GROUP BY id HAVING COUNT(*) > 1",
		);
		if ((dupIds as unknown[]).length === 0) result.passes.push("DB id uniqueness: no duplicates");
		else result.failures.push(`DB duplicate ids: ${(dupIds as unknown[]).length}`);

		// 7. College distribution
		const [colleges] = await sequelize.query(
			`SELECT college, COUNT(*) as count FROM person WHERE school = '${YALE_COLLEGE}' GROUP BY college ORDER BY count DESC`,
		);
		if ((colleges as unknown[]).length >= MIN_COLLEGES) {
			result.passes.push(`DB colleges: ${(colleges as unknown[]).length} distinct colleges`);
		} else {
			result.failures.push(`DB colleges: only ${(colleges as unknown[]).length}`);
		}

		// 8. Year distribution
		const [yearRows] = await sequelize.query(
			`SELECT year, COUNT(*) as count FROM person WHERE school = '${YALE_COLLEGE}' AND year IS NOT NULL GROUP BY year ORDER BY year`,
		);
		for (const row of yearRows as { year: number; count: string }[]) {
			if (EXPECTED_YEARS_SET.has(row.year)) {
				result.passes.push(`DB year ${row.year}: ${row.count} students`);
			}
		}

		// 9. Orphaned data
		const orphans = await query(
			"SELECT COUNT(*) as count FROM person WHERE school IS NULL AND school_code IS NULL AND organization IS NULL",
		);
		if (orphans === 0) result.passes.push("DB orphans: no records without school or organization");
		else result.warnings.push(`DB orphans: ${orphans} records with no school/org`);

	} finally {
		await sequelize.close();
	}

	return result;
}

export async function runValidation(
	step: "facebook" | "enriched" | "database" | "all",
	data?: {
		facebook?: FacebookStudent[];
		enriched?: EnrichedStudent[];
		databaseUrl?: string;
	},
): Promise<boolean> {
	let allPassed = true;

	if ((step === "facebook" || step === "all") && data?.facebook) {
		const result = validateFacebook(data.facebook);
		if (!reportResult(result, "Facebook Scraper Validation")) allPassed = false;
	}

	if ((step === "enriched" || step === "all") && data?.enriched) {
		const baseResult = validateFacebook(data.enriched);
		if (!reportResult(baseResult, "Enriched Data — Base Checks")) allPassed = false;

		const enrichResult = validateEnriched(data.enriched);
		if (!reportResult(enrichResult, "Enriched Data — Directory Checks")) allPassed = false;
	}

	if ((step === "database" || step === "all") && data?.databaseUrl) {
		const dbResult = await validateDatabase(data.databaseUrl);
		if (!reportResult(dbResult, "Database Validation")) allPassed = false;
	}

	console.log(`\n${"=".repeat(60)}`);
	if (allPassed) {
		console.log("  ALL VALIDATIONS PASSED");
	} else {
		console.log("  SOME VALIDATIONS FAILED — review above");
	}
	console.log("=".repeat(60));

	return allPassed;
}
