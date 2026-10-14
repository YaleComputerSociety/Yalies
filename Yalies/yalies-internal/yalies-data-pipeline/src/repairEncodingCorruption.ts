/** One-off, file-driven repair for the September 2026 Face Book encoding incident. */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { parseArgs } from "util";
import { configDotenv } from "dotenv";
import { QueryTypes, Sequelize } from "sequelize";
import { YALE_COLLEGE, YALE_COLLEGE_CODE } from "yalies-shared";
import { parseFacebookBrowserExport } from "./browserImports.js";
import { matchRecord } from "./sources/directory.js";
import { DirectoryRecord, FacebookStudent } from "./types.js";

configDotenv({
	path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"),
	// A guided production wrapper deliberately exports DATABASE_URL. Never let
	// the local dashboard configuration replace that verified target.
	override: false,
});

const REPLACEMENT_CHARACTER = "\uFFFD";
const EXPECTED_INCIDENT_ROWS = 49;
const DIRECTORY_REPAIR_SCHEMA = "yalies.directory-encoding-repair.v1";

type DbPerson = {
	id: number;
	netid: string | null;
	email: string | null;
	first_name: string;
	last_name: string;
	year: number | null;
	college: string | null;
	image: string | null;
};

type DirectoryRepairEntry = {
	photo_id: string;
	corrupt_full_name: string;
	corrected_full_name: string;
	queries: string[];
	records: DirectoryRecord[];
	error?: string;
};

type DirectoryRepairExport = {
	schemaVersion: typeof DIRECTORY_REPAIR_SCHEMA;
	corruptFacebookFingerprint: string;
	correctedFacebookFingerprint: string;
	entryCount: number;
	entries: DirectoryRepairEntry[];
};

type Repair = {
	row: DbPerson;
	corrupt: FacebookStudent;
	corrected: FacebookStudent;
	directory: DirectoryRecord | null;
	updates: Record<string, string | number>;
};

function usage(): void {
	console.log(`Usage:
  npm run repair-encoding -- \\
    --corrupt-facebook ORIGINAL.json \\
    --corrected-facebook CORRECTED.json \\
    --repair-directory DIRECTORY-REPAIR.json

Preview is read-only. Apply requires:
  --apply --target production --confirm REPAIR-XXXXXXXXXXXX
`);
}

function hasCorruptName(student: FacebookStudent): boolean {
	return [student.full_name, student.first_name, student.last_name]
		.some((value) => value.includes(REPLACEMENT_CHARACTER));
}

function studentKey(student: FacebookStudent): string {
	const year = student.year.match(/^'(\d{2})$/)?.[1];
	return [student.first_name, student.last_name, year ? `20${year}` : "", student.college].join("\u001f");
}

function rowKey(row: DbPerson): string {
	return [row.first_name, row.last_name, row.year || "", row.college || ""].join("\u001f");
}

function recordValues(record: DirectoryRecord | null): Record<string, string | number> {
	if (!record) return {};
	const mapping: Array<[string, keyof DirectoryRecord]> = [
		["netid", "NetId"], ["upi", "UPI"], ["email", "EmailAddress"], ["mailbox", "MailBox"],
		["phone", "PhoneNumber"], ["preferred_name", "KnownAs"], ["middle_name", "MiddleName"],
		["suffix", "Suffix"], ["school", "PrimarySchoolName"], ["school_code", "PrimarySchoolCode"],
		["year", "StudentExpectedGraduationYear"], ["curriculum", "StudentCurriculum"],
		["college", "ResidentialCollegeName"], ["college_code", "ResidentialCollegeCode"],
		["organization", "OrganizationName"], ["organization_code", "PrimaryOrganizationCode"],
		["unit", "OrganizationUnitName"], ["postal_address", "PostalAddress"],
	];
	return Object.fromEntries(mapping.flatMap(([column, field]) => {
		const value = record[field];
		return value !== undefined && value !== null && String(value).trim() ? [[column, value]] : [];
	}));
}

function readDirectoryRepair(filePath: string): DirectoryRepairExport {
	const value = JSON.parse(readFileSync(filePath, "utf8")) as DirectoryRepairExport;
	if (value.schemaVersion !== DIRECTORY_REPAIR_SCHEMA || !Array.isArray(value.entries)) {
		throw new Error("Unsupported Directory repair export");
	}
	if (value.entryCount !== EXPECTED_INCIDENT_ROWS || value.entries.length !== EXPECTED_INCIDENT_ROWS) {
		throw new Error(`Directory repair must contain exactly ${EXPECTED_INCIDENT_ROWS} entries`);
	}
	return value;
}

async function loadRepairs(
	database: Sequelize,
	corruptStudents: FacebookStudent[],
	correctedByCorruptKey: Map<string, FacebookStudent>,
	directoryByCorruptName: Map<string, DirectoryRepairEntry>,
): Promise<Repair[]> {
	const rows = await database.query<DbPerson>(
		`SELECT id, netid, email, first_name, last_name, year, college, image
		 FROM person
		 WHERE (school = :yc OR school_code = :ycCode)
		   AND (POSITION(:replacement IN first_name) > 0 OR POSITION(:replacement IN last_name) > 0)
		 ORDER BY id`,
		{
			type: QueryTypes.SELECT,
			replacements: { yc: YALE_COLLEGE, ycCode: YALE_COLLEGE_CODE, replacement: REPLACEMENT_CHARACTER },
		},
	);
	if (rows.length === 0) {
		throw new Error("Database has no corrupt-name rows; there is nothing to repair");
	}
	if (rows.length > corruptStudents.length) {
		throw new Error(`Database has ${rows.length} corrupt-name rows, exceeding the incident export's ${corruptStudents.length}`);
	}

	const rowByKey = new Map(rows.map((row) => [rowKey(row), row]));
	const repairs: Repair[] = [];
	const usedRowIds = new Set<number>();
	for (let index = 0; index < corruptStudents.length; index++) {
		const corrupt = corruptStudents[index];
		const corrected = correctedByCorruptKey.get(studentKey(corrupt));
		if (!corrected) throw new Error(`Corrected roster is missing ${corrupt.full_name}`);
		if (hasCorruptName(corrected)) throw new Error(`Corrected roster is still corrupt for ${corrupt.full_name}`);
		const imageSuffix = `/${corrupt.photo_id}.jpg`;
		const row = rowByKey.get(studentKey(corrupt))
			|| rows.find((candidate) => candidate.image?.endsWith(imageSuffix));
		// Some source names were already repaired indirectly because Directory
		// supplied a clean first name. They are intentionally absent from the live
		// corrupt-row query and need no write.
		if (!row) continue;
		if (usedRowIds.has(row.id)) throw new Error(`Database row ${row.id} matched more than one source student`);
		usedRowIds.add(row.id);
		const directoryEntry = directoryByCorruptName.get(corrupt.full_name);
		if (!directoryEntry) throw new Error(`Directory repair is missing ${corrupt.full_name}`);
		if (directoryEntry.error) throw new Error(`Directory lookup failed for ${corrected.full_name}: ${directoryEntry.error}`);
		const directoryEntryMatches = directoryEntry.corrected_full_name === corrected.full_name;
		if (!directoryEntryMatches && corrupt.photo_id !== "0") {
			throw new Error(`Directory repair name mismatch for ${corrupt.full_name}`);
		}

		// The first repair collector mistakenly treated the shared no-photo ID "0"
		// as unique. Its five affected entries still contain the right corrupt
		// names but unrelated Directory results, so discard only those results.
		const record = directoryEntryMatches ? matchRecord(corrected, directoryEntry.records) : null;
		const updates: Record<string, string | number> = {
			...recordValues(record),
			first_name: record?.FirstName || corrected.first_name,
			last_name: record?.LastName || corrected.last_name,
		};
		repairs.push({ row, corrupt, corrected, directory: record, updates });
		console.log(
			`  ${index + 1}/${corruptStudents.length}: ${corrupt.full_name} -> ` +
			`${updates.first_name} ${updates.last_name}${record?.EmailAddress ? ` <${record.EmailAddress}>` : " (Directory unmatched)"}`,
		);
	}
	const unmatchedRows = rows.filter((row) => !usedRowIds.has(row.id));
	if (unmatchedRows.length > 0) {
		throw new Error(`Could not tie ${unmatchedRows.length} live corrupt rows back to the incident export`);
	}
	console.log(`Resolved all ${rows.length} live corrupt-name rows (${corruptStudents.length - rows.length} incident records do not currently have a corrupt live row).`);
	return repairs;
}

async function partitionIdentityConflicts(
	database: Sequelize,
	repairs: Repair[],
): Promise<{ safe: Repair[]; skipped: Array<{ repair: Repair; conflictingId: number }> }> {
	const safe: Repair[] = [];
	const skipped: Array<{ repair: Repair; conflictingId: number }> = [];
	for (const repair of repairs) {
		const netid = repair.updates.netid;
		if (!netid) {
			safe.push(repair);
			continue;
		}
		const conflicts = await database.query<{ id: number }>(
			"SELECT id FROM person WHERE LOWER(netid) = LOWER(:netid) AND id <> :id",
			{ type: QueryTypes.SELECT, replacements: { netid, id: repair.row.id } },
		);
		if (conflicts.length > 0) {
			skipped.push({ repair, conflictingId: conflicts[0].id });
		} else {
			safe.push(repair);
		}
	}
	return { safe, skipped };
}

async function applyRepairs(database: Sequelize, repairs: Repair[], token: string): Promise<string> {
	const transaction = await database.transaction();
	try {
		const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
		const backupTable = `person_backup_encoding_${timestamp}_${token.slice(-6).toLowerCase()}`;
		await database.query(
			`CREATE TABLE "${backupTable}" AS SELECT * FROM person WHERE id IN (:ids)`,
			{ transaction, replacements: { ids: repairs.map((repair) => repair.row.id) } },
		);
		for (const repair of repairs) {
			const assignments = Object.keys(repair.updates).map((column) => `${column} = :${column}`).join(", ");
			await database.query(
				`UPDATE person SET ${assignments} WHERE id = :repair_id`,
				{ transaction, replacements: { ...repair.updates, repair_id: repair.row.id } },
			);
		}
		const remaining = await database.query<{ count: string }>(
			`SELECT COUNT(*) AS count FROM person
			 WHERE id IN (:ids)
			   AND (POSITION(:replacement IN first_name) > 0 OR POSITION(:replacement IN last_name) > 0)`,
			{
				type: QueryTypes.SELECT,
				transaction,
				replacements: { ids: repairs.map((repair) => repair.row.id), replacement: REPLACEMENT_CHARACTER },
			},
		);
		if (Number(remaining[0]?.count || 0) !== 0) throw new Error("Post-update Unicode verification failed");
		await transaction.commit();
		return backupTable;
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			"corrupt-facebook": { type: "string" },
			"corrected-facebook": { type: "string" },
			"repair-directory": { type: "string" },
			"database-url": { type: "string" },
			"target": { type: "string" },
			"confirm": { type: "string" },
			"apply": { type: "boolean", default: false },
			"help": { type: "boolean", default: false },
		},
	});
	if (values.help) return usage();
	for (const required of ["corrupt-facebook", "corrected-facebook", "repair-directory"] as const) {
		if (!values[required]) throw new Error(`--${required} is required`);
	}
	const databaseUrl = values["database-url"] || process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL or --database-url is required");
	if (values.apply && !values.confirm) throw new Error("--apply requires --confirm from a fresh preview");
	if (!["development", "production"].includes(values.target || "")) {
		throw new Error("--target development or --target production is required");
	}

	const corruptExport = parseFacebookBrowserExport(
		JSON.parse(readFileSync(path.resolve(values["corrupt-facebook"]!), "utf8")) as unknown,
	);
	const correctedExport = parseFacebookBrowserExport(
		JSON.parse(readFileSync(path.resolve(values["corrected-facebook"]!), "utf8")) as unknown,
	);
	const corruptStudents = corruptExport.students.filter(hasCorruptName);
	if (corruptStudents.length !== EXPECTED_INCIDENT_ROWS) {
		throw new Error(`Expected ${EXPECTED_INCIDENT_ROWS} corrupt-name records; found ${corruptStudents.length}`);
	}
	if (correctedExport.students.length !== corruptExport.students.length) {
		throw new Error("Original and corrected Face Book exports have different roster sizes");
	}
	const correctedByCorruptKey = new Map<string, FacebookStudent>();
	for (let index = 0; index < corruptExport.students.length; index++) {
		const corrupt = corruptExport.students[index];
		if (!hasCorruptName(corrupt)) continue;
		const corrected = correctedExport.students[index];
		if (corrected.year !== corrupt.year || corrected.college !== corrupt.college) {
			throw new Error(`Roster order mismatch at original index ${index}`);
		}
		if (corrupt.photo_id !== "0" && corrected.photo_id !== corrupt.photo_id) {
			throw new Error(`Photo ID mismatch at original index ${index}`);
		}
		correctedByCorruptKey.set(studentKey(corrupt), corrected);
	}
	const directoryRepair = readDirectoryRepair(path.resolve(values["repair-directory"]!));
	if (directoryRepair.corruptFacebookFingerprint !== corruptExport.fingerprint
		|| directoryRepair.correctedFacebookFingerprint !== correctedExport.fingerprint) {
		throw new Error("Directory repair export does not belong to the supplied Face Book exports");
	}
	const directoryByCorruptName = new Map(directoryRepair.entries.map((entry) => [entry.corrupt_full_name, entry]));
	if (directoryByCorruptName.size !== directoryRepair.entries.length) {
		throw new Error("Directory repair contains duplicate corrupt names");
	}

	const database = new Sequelize(databaseUrl, { logging: false });
	try {
		await database.authenticate();
		const [identity] = await database.query<{ database_name: string; database_user: string; database_host: string }>(
			"SELECT current_database() AS database_name, current_user AS database_user, COALESCE(inet_server_addr()::text, 'local') AS database_host",
			{ type: QueryTypes.SELECT },
		);
		const targetDescription = `${identity.database_user}@${identity.database_host}/${identity.database_name}`;
		if (values.target === "production" && identity.database_name !== "postgres") {
			throw new Error(`Production repair expected database 'postgres', found '${identity.database_name}'`);
		}
		console.log(`Database target: ${targetDescription}`);
		const candidates = await loadRepairs(database, corruptStudents, correctedByCorruptKey, directoryByCorruptName);
		const { safe: repairs, skipped } = await partitionIdentityConflicts(database, candidates);
		if (repairs.length === 0) throw new Error("Every candidate conflicts with an existing identity; nothing is safe to apply");
		for (const { repair, conflictingId } of skipped) {
			console.warn(
				`SKIP identity conflict: ${repair.corrected.full_name} wants NetID ${repair.updates.netid}; ` +
				`already owned by row ${conflictingId}`,
			);
		}
		const token = `REPAIR-${createHash("sha256").update(JSON.stringify({ targetDescription, repairs, skipped })).digest("hex").slice(0, 12).toUpperCase()}`;
		const matched = repairs.filter((repair) => repair.directory).length;
		console.log(
			`\nRepair preview: ${repairs.length} safe rows; ${matched} Directory matches; ` +
			`${repairs.length - matched} names only; ${skipped.length} identity conflicts skipped`,
		);
		console.log(`Confirmation token: ${token}`);
		if (!values.apply) {
			console.log(`No database changes made. Re-run with --apply --target <development|production> --confirm ${token}`);
			return;
		}
		if (values.confirm !== token) throw new Error("Confirmation token is missing or stale");
		const backupTable = await applyRepairs(database, repairs, token);
		console.log(`Applied ${repairs.length} repairs. Recovery table: ${backupTable}`);
	} finally {
		await database.close();
	}
}

main().catch((error) => {
	console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
