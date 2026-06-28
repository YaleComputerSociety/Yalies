import { Sequelize, QueryTypes } from "sequelize";
import { decode } from "html-entities";
import { EnrichedStudent, DbRow } from "./types.js";
import { parseLocation } from "./parseLocation.js";
import { YALE_COLLEGE, YALE_COLLEGE_CODE } from "yalies-shared";

const MONTH_MAP: Record<string, number> = {
	"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
	"Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
};

function parseBirthday(bday?: string): { month?: number; day?: number } {
	if (!bday) return {};
	const match = bday.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/);
	if (match) {
		return { month: MONTH_MAP[match[1]], day: parseInt(match[2]) };
	}
	return {};
}

function parseYear(yearStr?: string, yearDir?: number): number | undefined {
	if (yearDir) return yearDir;
	if (yearStr) {
		const match = yearStr.match(/^'(\d{2})$/);
		if (match) return 2000 + parseInt(match[1]);
	}
	return undefined;
}

function cleanStr(value?: string | number | null): string | undefined {
	if (value === null || value === undefined) return undefined;
	const str = decode(String(value).trim());
	return str.length > 0 ? str : undefined;
}

export function toDbRow(student: EnrichedStudent): DbRow {
	const { month: birthMonth, day: birthDay } = parseBirthday(student.birthday);
	const year = parseYear(student.year, student.year_directory);
	const upi = student.upi;
	const photoId = student.photo_id;

	let image: string | undefined;
	if (photoId && photoId !== "0") {
		image = `https://storage.googleapis.com/yalies-photos/${photoId}.jpg`;
	}

	let address = student.student_address || student.address || "";
	if (address) {
		address = address.replace(/ \| /g, "\n");
	}

	const cleanedAddress = cleanStr(address);
	const { address_state, address_country } = parseLocation(cleanedAddress);

	return {
		id: upi || 0,
		netid: cleanStr(student.netid)?.toLowerCase(),
		upi,
		email: cleanStr(student.email),
		mailbox: cleanStr(student.mailbox),
		phone: cleanStr(student.phone_directory || student.phone),
		first_name: cleanStr(student.first_name_directory || student.first_name) || "",
		preferred_name: cleanStr(student.preferred_name),
		middle_name: cleanStr(student.middle_name),
		last_name: cleanStr(student.last_name) || "",
		suffix: cleanStr(student.suffix),
		pronouns: cleanStr(student.pronouns),
		school: cleanStr(student.school) || YALE_COLLEGE,
		school_code: cleanStr(student.school_code) || YALE_COLLEGE_CODE,
		year,
		curriculum: cleanStr(student.curriculum),
		college: cleanStr(student.college_directory || student.college),
		college_code: cleanStr(student.college_code),
		image,
		birth_month: birthMonth,
		birth_day: birthDay,
		major: cleanStr(student.major),
		address: cleanedAddress,
		address_state: address_state ?? undefined,
		address_country: address_country ?? undefined,
		organization: cleanStr(student.organization),
		organization_code: cleanStr(student.organization_code),
		unit: cleanStr(student.unit),
		postal_address: cleanStr(student.postal_address),
	};
}

export async function loadToDatabase(
	students: EnrichedStudent[],
	databaseUrl: string,
	dryRun = false,
	force = false,
): Promise<void> {
	console.log(`Loading ${students.length} students into database...`);

	const sequelize = new Sequelize(databaseUrl, { logging: false });
	const ycReplacements = { yc: YALE_COLLEGE, ycCode: YALE_COLLEGE_CODE };

	try {
		await sequelize.authenticate();
		console.log("Connected to database");

		// Pre-check
		const [existingResult] = await sequelize.query<{ count: string }>(
			"SELECT COUNT(*) as count FROM person WHERE school = :yc OR school_code = :ycCode",
			{ type: QueryTypes.SELECT, replacements: ycReplacements },
		);
		const existingCount = parseInt(existingResult.count);
		console.log(`Existing ${YALE_COLLEGE} rows: ${existingCount}`);

		if (dryRun) {
			console.log(`DRY RUN: Would delete ${existingCount} rows and insert ~${students.length}`);
			return;
		}

		// Safety guard: refuse to replace a healthy roster with a much smaller
		// one (e.g. a partial scrape from an expired cookie) unless forced.
		// Runs after the dry-run return so a preview is never blocked.
		if (!force && existingCount > 0 && students.length < existingCount * 0.8) {
			throw new Error(
				`Refusing to sync: new set (${students.length}) is under 80% of existing ` +
				`${YALE_COLLEGE} rows (${existingCount}). Re-run with --force to override.`,
			);
		}

		const transaction = await sequelize.transaction();

		try {
			// Step 1: Delete existing rows
			await sequelize.query(
				"DELETE FROM person WHERE school = :yc OR school_code = :ycCode",
				{ transaction, replacements: ycReplacements },
			);
			console.log(`Deleted existing ${YALE_COLLEGE} rows`);

			// Step 2: Insert new students
			let inserted = 0;
			const seenIds = new Set<number>();
			const idConflicts: string[] = [];

			for (const student of students) {
				const row = toDbRow(student);

				// Generate stable ID for students without UPI
				if (!row.id) {
					const nameKey = `${YALE_COLLEGE_CODE}_${row.first_name}_${row.last_name}_${row.year || ""}_${row.college || ""}`;
					row.id = Math.abs(hashCode(nameKey)) % (2 ** 31 - 1);
				}

				// Handle duplicate IDs
				if (seenIds.has(row.id)) {
					const baseId = row.id;
					let counter = 1;
					while (seenIds.has(row.id)) {
						row.id = (baseId + counter) % (2 ** 31 - 1);
						counter++;
					}
					idConflicts.push(`${row.first_name} ${row.last_name}`);
				}
				seenIds.add(row.id);

				// Build insert query with only non-null values
				const entries = Object.entries(row).filter(([, v]) => v !== undefined && v !== null);
				const columns = entries.map(([k]) => k).join(", ");
				const placeholders = entries.map(([k]) => `:${k}`).join(", ");
				const replacements = Object.fromEntries(entries);

				await sequelize.query(
					`INSERT INTO person (${columns}) VALUES (${placeholders})`,
					{ replacements, transaction },
				);
				inserted++;
			}

			await transaction.commit();

			console.log(`Inserted ${inserted} students`);
			if (idConflicts.length > 0) {
				console.log(`Resolved ${idConflicts.length} ID conflicts: ${idConflicts.slice(0, 5).join(", ")}...`);
			}

			// Step 3: Verify
			const [totalResult] = await sequelize.query<{ count: string }>(
				"SELECT COUNT(*) as count FROM person",
				{ type: QueryTypes.SELECT },
			);
			const [ycResult] = await sequelize.query<{ count: string }>(
				"SELECT COUNT(*) as count FROM person WHERE school = :yc",
				{ type: QueryTypes.SELECT, replacements: ycReplacements },
			);
			const [netidResult] = await sequelize.query<{ count: string }>(
				"SELECT COUNT(*) as count FROM person WHERE school = :yc AND netid IS NOT NULL",
				{ type: QueryTypes.SELECT, replacements: ycReplacements },
			);

			console.log("\nDatabase summary:");
			console.log(`  Total rows: ${totalResult.count}`);
			console.log(`  ${YALE_COLLEGE} rows: ${ycResult.count}`);
			console.log(`  ${YALE_COLLEGE} with netid: ${netidResult.count}`);
			console.log(`  Non-${YALE_COLLEGE} rows: ${parseInt(totalResult.count) - parseInt(ycResult.count)}`);
		} catch (e) {
			await transaction.rollback();
			throw e;
		}
	} finally {
		await sequelize.close();
	}
}

function hashCode(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0; // Convert to 32-bit integer
	}
	return hash;
}
