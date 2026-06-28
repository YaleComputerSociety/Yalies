import * as cheerio from "cheerio";
import { FacebookStudent, EnrichedStudent, DirectoryRecord, DirectoryApiResponse } from "../types.js";
import { httpGet, httpPost } from "../httpClient.js";
import { sleep } from "../util.js";
import { YALE_COLLEGE_CODE } from "yalies-shared";

const DIRECTORY_URL = "https://directory.yale.edu";
const API_URL = `${DIRECTORY_URL}/api`;
const MAX_RETRIES = 3;
const CSRF_REFRESH_INTERVAL = 500;

export default class DirectorySource {
	#sessionCookie: string;
	#csrfToken = "";
	#requestsSinceCsrf = 0;

	constructor(sessionCookie: string) {
		this.#sessionCookie = sessionCookie;
	}

	#buildHeaders = (): Record<string, string> => ({
		"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
		"Cookie": `_people_search_session=${this.#sessionCookie}; loggedIn=true`,
		"Referer": `${DIRECTORY_URL}/`,
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
	});

	fetchCsrfToken = async (): Promise<string> => {
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await httpGet(DIRECTORY_URL, this.#buildHeaders());
				const html = response.body;

				if (html.includes("cas/login")) {
					throw new Error("Not authenticated. Update session cookie.");
				}

				const $ = cheerio.load(html);
				const csrfMeta = $("meta[name='csrf-token']").attr("content");
				if (csrfMeta) {
					this.#csrfToken = csrfMeta;
					this.#requestsSinceCsrf = 0;
					return csrfMeta;
				}
				throw new Error("Could not find CSRF token in page");
			} catch (e) {
				if (attempt === MAX_RETRIES - 1) throw e;
				const wait = Math.pow(2, attempt) * 1000;
				console.log(`  Retry fetching CSRF (${attempt + 1}/${MAX_RETRIES}) after ${wait}ms`);
				await sleep(wait);
			}
		}
		throw new Error("Failed to fetch CSRF token");
	};

	searchPerson = async (firstName: string, lastName: string): Promise<DirectoryRecord[]> => {
		const pattern = `${firstName},${lastName}`;
		const payload = {
			peoplesearch: [{
				netid: "",
				queryType: "term",
				query: [{ pattern }],
			}],
		};

		const headers = {
			...this.#buildHeaders(),
			"Content-Type": "application/json",
			"Accept": "application/json, text/javascript, */*; q=0.01",
			"X-CSRF-Token": this.#csrfToken,
			"X-Requested-With": "XMLHttpRequest",
			"Origin": DIRECTORY_URL,
			"Referer": `${DIRECTORY_URL}/`,
		};

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await httpPost(API_URL, headers, JSON.stringify(payload));
				if (response.status >= 400) {
					const error = new Error(`HTTP ${response.status}`) as Error & { status: number };
					error.status = response.status;
					throw error;
				}
				const data = JSON.parse(response.body) as DirectoryApiResponse;
				return extractRecords(data);
			} catch (e) {
				// Don't retry client errors (e.g. 422 = not found) — only network/5xx.
				const status = (e as { status?: number }).status;
				if (status && status >= 400 && status < 500) throw e;
				if (attempt === MAX_RETRIES - 1) throw e;
				const wait = Math.pow(2, attempt) * 1000;
				console.log(`  Retry for ${firstName} ${lastName} (${attempt + 1}/${MAX_RETRIES}) after ${wait}ms`);
				await sleep(wait);
			}
		}
		return [];
	};

	enrich = async (
		students: FacebookStudent[],
		delay = 300,
		saveEvery = 50,
		startFrom = 0,
		onSave?: (students: EnrichedStudent[]) => void,
	): Promise<EnrichedStudent[]> => {
		console.log("Fetching CSRF token...");
		await this.fetchCsrfToken();
		console.log(`Got CSRF token: ${this.#csrfToken.substring(0, 20)}...`);

		const enriched = students as EnrichedStudent[];
		let enrichedCount = 0;
		let notFound = 0;
		let multiMatch = 0;
		let errors = 0;

		for (let i = startFrom; i < enriched.length; i++) {
			const student = enriched[i];
			const first = student.first_name;
			const last = student.last_name;

			if (!first || !last) {
				notFound++;
				continue;
			}

			if (student.netid && startFrom === 0) {
				enrichedCount++;
				continue;
			}

			this.#requestsSinceCsrf++;
			if (this.#requestsSinceCsrf >= CSRF_REFRESH_INTERVAL) {
				try {
					await this.fetchCsrfToken();
				} catch (e) {
					console.log(`  Warning: CSRF refresh failed: ${e}`);
				}
			}

			try {

				const cleanFirst = first.replace(/\s*\(.*?\)\s*/g, "").trim();
				const cleanLast = last;

				const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
				const searchFirst = stripAccents(cleanFirst);
				const searchLast = stripAccents(cleanLast);

				let records = await this.searchPerson(searchFirst, searchLast);

				if (records.length === 0) {
					const lastParts = searchLast.split(" ");
					const firstParts = searchFirst.split(" ");

					if (lastParts.length > 1) {
						records = await this.searchPerson(searchFirst, lastParts[0]);
						await sleep(delay);
						if (records.length === 0) {
							records = await this.searchPerson(searchFirst, lastParts[lastParts.length - 1]);
							await sleep(delay);
						}
					}

					if (records.length === 0 && firstParts.length > 1) {
						records = await this.searchPerson(firstParts[0], searchLast);
						await sleep(delay);

						if (records.length === 0) {
							records = await this.searchPerson(firstParts[1], searchLast);
							await sleep(delay);
						}
					}

					if (records.length === 0) {
						records = await this.searchPerson("", searchLast);
						await sleep(delay);
					}

					if (records.length === 0 && lastParts.length > 1) {
						records = await this.searchPerson(firstParts[0], lastParts[0]);
						await sleep(delay);
					}
				}

				if (records.length === 0) {
					notFound++;
				} else if (records.length === 1) {
					enrichStudent(enriched[i], records[0]);
					enrichedCount++;
				} else {
					const best = matchRecord(student, records);
					if (best) {
						enrichStudent(enriched[i], best);
						enrichedCount++;
						multiMatch++;
					} else {
						notFound++;
					}
				}
			} catch (e) {
				const err = e as { status?: number; message?: string };
				if (err.status === 422) {
					notFound++;
				} else if (err.status === 401 || err.status === 403) {
					errors++;
					console.log(`  Auth error for ${first} ${last} — refreshing CSRF token...`);
					try {
						await this.fetchCsrfToken();
					} catch {
						console.log(`  FATAL: Could not refresh session. Resume with --start-from ${i}`);
						onSave?.(enriched);
						throw new Error("Session expired");
					}
				} else {
					errors++;
					console.log(`  Error for ${first} ${last}: ${err.message || e}`);
				}
			}

			if ((i + 1) % 10 === 0) {
				console.log(`Progress: ${i + 1}/${enriched.length} | enriched=${enrichedCount} not_found=${notFound} multi=${multiMatch} errors=${errors}`);
			}

			if ((i + 1) % saveEvery === 0) {
				onSave?.(enriched);
			}

			await sleep(delay);
		}

		console.log("\nEnrichment complete:");
		console.log(`  Enriched: ${enrichedCount}`);
		console.log(`  Not found: ${notFound}`);
		console.log(`  Multiple matches: ${multiMatch}`);
		console.log(`  Errors: ${errors}`);

		return enriched;
	};
}

function extractRecords(response: DirectoryApiResponse): DirectoryRecord[] {
	const records = response.Records;
	if (!records || records.TotalRecords === 0) return [];

	const data = records.Record;
	if (Array.isArray(data)) return data;
	if (data && typeof data === "object") return [data];
	return [];
}

export function enrichStudent(student: EnrichedStudent, record: DirectoryRecord): void {
	const mapping: Record<string, keyof DirectoryRecord> = {
		netid: "NetId",
		email: "EmailAddress",
		upi: "UPI",
		mailbox: "MailBox",
		phone_directory: "PhoneNumber",
		first_name_directory: "FirstName",
		preferred_name: "KnownAs",
		middle_name: "MiddleName",
		suffix: "Suffix",
		school: "PrimarySchoolName",
		school_code: "PrimarySchoolCode",
		year_directory: "StudentExpectedGraduationYear",
		curriculum: "StudentCurriculum",
		college_code: "ResidentialCollegeCode",
		college_directory: "ResidentialCollegeName",
		organization: "OrganizationName",
		organization_code: "PrimaryOrganizationCode",
		unit: "OrganizationUnitName",
		title: "DirectoryTitle",
		postal_address: "PostalAddress",
		student_address: "StudentAddress",
		registered_address: "RegisteredAddress",
	};

	for (const [ourField, apiField] of Object.entries(mapping)) {
		const value = record[apiField];
		if (value && String(value).trim()) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(student as any)[ourField] = value;
		}
	}
}

export function matchRecord(student: FacebookStudent, records: DirectoryRecord[]): DirectoryRecord | null {
	const studentCollege = student.college?.toLowerCase() || "";
	const studentFirst = student.first_name.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();
	const studentLast = student.last_name.toLowerCase();
	let studentYearInt: number | null = null;
	if (student.year?.startsWith("'")) {
		const parsed = parseInt(student.year.slice(1));
		if (!isNaN(parsed)) studentYearInt = 2000 + parsed;
	}

	let bestRecord: DirectoryRecord | null = null;
	let bestScore = -1;

	for (const rec of records) {
		let score = 0;
		const recCollege = (rec.ResidentialCollegeName || "").toLowerCase();
		const recYear = rec.StudentExpectedGraduationYear;
		const recFirst = (rec.FirstName || "").toLowerCase();
		const recLast = (rec.LastName || "").toLowerCase();
		const recKnown = (rec.KnownAs || "").toLowerCase();

		if (recCollege && recCollege === studentCollege) score += 3;

		if (studentYearInt && recYear && Number(recYear) === studentYearInt) score += 2;

		if (rec.PrimarySchoolCode === YALE_COLLEGE_CODE) score += 1;

		const firstParts = studentFirst.split(" ");
		if (firstParts.some(p => p === recFirst || p === recKnown)) score += 2;
		else if (recFirst.includes(studentFirst) || studentFirst.includes(recFirst)) score += 1;

		if (recLast === studentLast) score += 2;
		else if (studentLast.includes(recLast) || recLast.includes(studentLast)) score += 1;

		if (score > bestScore) {
			bestScore = score;
			bestRecord = rec;
		}
	}

	if (bestScore < 3) return null;

	return bestRecord;
}
