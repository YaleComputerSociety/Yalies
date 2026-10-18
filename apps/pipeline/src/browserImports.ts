import { createHash } from "crypto";
import { readFileSync } from "fs";
import { DirectoryRecord, EnrichedStudent, FacebookStudent } from "./types.js";
import { enrichStudent, MIN_DIRECTORY_MATCH_SCORE, scoreRecord } from "./sources/directory.js";

export const FACEBOOK_EXPORT_SCHEMA = "yalies.facebook.v1";
export const DIRECTORY_EXPORT_SCHEMA = "yalies.directory.v1";

export type FacebookBrowserExport = {
	schemaVersion: typeof FACEBOOK_EXPORT_SCHEMA;
	exportedAt: string;
	sourceUrl: string;
	selectedOrganization?: string;
	fingerprint: string;
	students: FacebookStudent[];
};

export type DirectoryExportEntry = {
	index: number;
	full_name: string;
	queries: string[];
	records: DirectoryRecord[];
	error?: string;
};

export type DirectoryBrowserExport = {
	schemaVersion: typeof DIRECTORY_EXPORT_SCHEMA;
	exportedAt: string;
	sourceUrl: string;
	facebookFingerprint: string;
	facebookExportedAt: string;
	entryCount: number;
	entries: DirectoryExportEntry[];
};

export type BrowserImportSummary = {
	students: EnrichedStudent[];
	matched: number;
	unmatched: number;
	ambiguous: number;
	errors: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(object: Record<string, unknown>, key: string): string {
	const value = object[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Invalid browser export: ${key} must be a non-empty string`);
	}
	return value;
}

function requireStudent(value: unknown, index: number): FacebookStudent {
	if (!isObject(value)) throw new Error(`Invalid Facebook export: students[${index}] is not an object`);
	for (const field of ["full_name", "first_name", "last_name", "year", "college", "photo_id", "details_raw"]) {
		if (typeof value[field] !== "string") {
			throw new Error(`Invalid Facebook export: students[${index}].${field} must be a string`);
		}
	}
	return value as FacebookStudent;
}

export function fingerprintStudents(students: FacebookStudent[]): string {
	const canonical = students.map((student) => [
		student.full_name,
		student.year,
		student.college,
		student.photo_id,
	].join("\u001f")).join("\n");
	return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseFacebookBrowserExport(value: unknown): FacebookBrowserExport {
	if (!isObject(value)) throw new Error("Invalid Facebook export: expected an object");
	if (value.schemaVersion !== FACEBOOK_EXPORT_SCHEMA) {
		throw new Error(`Unsupported Facebook export schema: ${String(value.schemaVersion)}`);
	}
	if (!Array.isArray(value.students)) throw new Error("Invalid Facebook export: students must be an array");

	const students = value.students.map(requireStudent);
	const fingerprint = requireString(value, "fingerprint");
	const calculated = fingerprintStudents(students);
	if (fingerprint !== calculated) {
		throw new Error("Facebook export fingerprint does not match its student data; the file may be incomplete or edited");
	}

	return {
		schemaVersion: FACEBOOK_EXPORT_SCHEMA,
		exportedAt: requireString(value, "exportedAt"),
		sourceUrl: requireString(value, "sourceUrl"),
		...(typeof value.selectedOrganization === "string" && { selectedOrganization: value.selectedOrganization }),
		fingerprint,
		students,
	};
}

export function parseDirectoryBrowserExport(value: unknown): DirectoryBrowserExport {
	if (!isObject(value)) throw new Error("Invalid Directory export: expected an object");
	if (value.schemaVersion !== DIRECTORY_EXPORT_SCHEMA) {
		throw new Error(`Unsupported Directory export schema: ${String(value.schemaVersion)}`);
	}
	if (!Array.isArray(value.entries)) throw new Error("Invalid Directory export: entries must be an array");

	const entries = value.entries.map((entry, arrayIndex): DirectoryExportEntry => {
		if (!isObject(entry)) throw new Error(`Invalid Directory export: entries[${arrayIndex}] is not an object`);
		if (!Number.isInteger(entry.index) || entry.index !== arrayIndex) {
			throw new Error(`Invalid Directory export: entries[${arrayIndex}].index must equal ${arrayIndex}`);
		}
		if (!Array.isArray(entry.queries) || !entry.queries.every((query) => typeof query === "string")) {
			throw new Error(`Invalid Directory export: entries[${arrayIndex}].queries must be strings`);
		}
		if (!Array.isArray(entry.records) || !entry.records.every(isObject)) {
			throw new Error(`Invalid Directory export: entries[${arrayIndex}].records must be objects`);
		}
		return {
			index: entry.index as number,
			full_name: requireString(entry, "full_name"),
			queries: entry.queries as string[],
			records: entry.records as DirectoryRecord[],
			...(typeof entry.error === "string" && { error: entry.error }),
		};
	});

	if (!Number.isInteger(value.entryCount) || value.entryCount !== entries.length) {
		throw new Error("Invalid Directory export: entryCount does not match entries.length");
	}

	return {
		schemaVersion: DIRECTORY_EXPORT_SCHEMA,
		exportedAt: requireString(value, "exportedAt"),
		sourceUrl: requireString(value, "sourceUrl"),
		facebookFingerprint: requireString(value, "facebookFingerprint"),
		facebookExportedAt: requireString(value, "facebookExportedAt"),
		entryCount: value.entryCount as number,
		entries,
	};
}

export function readFacebookBrowserExport(filePath: string): FacebookBrowserExport {
	return parseFacebookBrowserExport(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
}

export function readDirectoryBrowserExport(filePath: string): DirectoryBrowserExport {
	return parseDirectoryBrowserExport(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
}

export function mergeBrowserExports(
	facebook: FacebookBrowserExport,
	directory: DirectoryBrowserExport,
): BrowserImportSummary {
	if (directory.facebookFingerprint !== facebook.fingerprint) {
		throw new Error("The Directory export was produced from a different Facebook export (fingerprints differ)");
	}
	if (directory.facebookExportedAt !== facebook.exportedAt) {
		throw new Error("The Directory export references a different Facebook export timestamp");
	}
	if (directory.entries.length !== facebook.students.length) {
		throw new Error(`Directory export has ${directory.entries.length} entries for ${facebook.students.length} students`);
	}

	const students = facebook.students.map((student) => ({ ...student })) as EnrichedStudent[];
	let errors = 0;
	type Candidate = { studentIndex: number; record: DirectoryRecord; recordKey: string; score: number };
	const candidateLists: Candidate[][] = [];

	for (let index = 0; index < students.length; index++) {
		const entry = directory.entries[index];
		const student = students[index];
		if (entry.full_name !== student.full_name) {
			throw new Error(`Student mismatch at index ${index}: Facebook has "${student.full_name}", Directory has "${entry.full_name}"`);
		}
		if (entry.error) errors++;

		const seenRecordKeys = new Set<string>();
		const candidates = entry.records.flatMap((record): Candidate[] => {
			const recordKey = String(record.UPI || record.NetId || record.EmailAddress || "");
			if (!recordKey || seenRecordKeys.has(recordKey)) return [];
			seenRecordKeys.add(recordKey);
			const score = scoreRecord(student, record);
			if (score < MIN_DIRECTORY_MATCH_SCORE) return [];
			return [{ studentIndex: index, record, recordKey, score }];
		});
		candidateLists[index] = candidates.sort((a, b) => b.score - a.score || a.recordKey.localeCompare(b.recordKey));
	}

	// Resolve candidates globally instead of matching each Face Book card in
	// isolation. A Directory identity may be assigned at most once. A uniquely
	// stronger proposal wins; a top-score tie is deliberately left unresolved.
	const assignments = new Map<number, Candidate>();
	const assignedRecords = new Set<string>();
	const blockedRecords = new Set<string>();
	const ambiguousStudents = new Set<number>();

	while (true) {
		const proposals = new Map<string, Candidate[]>();
		for (let studentIndex = 0; studentIndex < candidateLists.length; studentIndex++) {
			if (assignments.has(studentIndex)) continue;
			const candidate = candidateLists[studentIndex].find(
				(item) => !assignedRecords.has(item.recordKey) && !blockedRecords.has(item.recordKey),
			);
			if (!candidate) continue;
			const existing = proposals.get(candidate.recordKey) || [];
			existing.push(candidate);
			proposals.set(candidate.recordKey, existing);
		}
		if (proposals.size === 0) break;

		for (const [recordKey, candidates] of proposals) {
			const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
			const winners = candidates.filter((candidate) => candidate.score === bestScore);
			if (winners.length === 1) {
				assignments.set(winners[0].studentIndex, winners[0]);
				assignedRecords.add(recordKey);
			} else {
				blockedRecords.add(recordKey);
				for (const winner of winners) ambiguousStudents.add(winner.studentIndex);
			}
		}
	}

	for (const [studentIndex, candidate] of assignments) {
		enrichStudent(students[studentIndex], candidate.record);
	}
	const matched = assignments.size;
	const unmatched = students.length - matched;
	const ambiguous = [...ambiguousStudents].filter((index) => !assignments.has(index)).length;

	return { students, matched, unmatched, ambiguous, errors };
}
