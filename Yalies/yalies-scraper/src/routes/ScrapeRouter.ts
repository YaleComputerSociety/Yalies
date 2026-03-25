import { Router, Request, Response } from "express";
import { writeFileSync, mkdirSync } from "fs";
import FacebookSource from "../sources/facebook.js";
import DirectorySource from "../sources/directory.js";
import { EnrichedStudent, DirectoryRecord, FacebookStudent } from "../types.js";
import { validateFacebook, validateEnriched } from "../validate.js";
import { sleep } from "../util.js";
import {
	getFacebookData,
	setFacebookData,
	setEnrichedData,
} from "../state.js";

const OUTPUT_DIR = "output";

const saveJson = (filename: string, data: unknown): void => {
	mkdirSync(OUTPUT_DIR, { recursive: true });
	writeFileSync(`${OUTPUT_DIR}/${filename}`, JSON.stringify(data, null, 2));
	console.log(`Saved ${OUTPUT_DIR}/${filename}`);
};

type SSEEvent = {
	type: "progress" | "complete" | "error" | "validation";
	message: string;
	count?: number;
	total?: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data?: any;
};

const sendSSE = (res: Response, event: SSEEvent): void => {
	res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const setupSSE = (res: Response): void => {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.flushHeaders();
};

const CSRF_REFRESH_INTERVAL = 500;

export default class ScrapeRouter {
	#router: Router;

	constructor() {
		this.#router = Router();
		this.#router.post("/facebook", this.#scrapeFacebook);
		this.#router.post("/directory", this.#scrapeDirectory);
	}

	getRouter = (): Router => this.#router;

	#scrapeFacebook = async (req: Request, res: Response): Promise<void> => {
		setupSSE(res);

		try {
			const { cookie } = req.body as { cookie: string };

			if (!cookie) {
				sendSSE(res, { type: "error", message: "Missing cookie in request body" });
				res.end();
				return;
			}

			const source = new FacebookSource(cookie);

			sendSSE(res, { type: "progress", message: "Fetching all students (this takes ~30 seconds)...", count: 0, total: 0 });

			const { students: allStudents } = await source.fetchPage(-1, -1);

			// Store in state + save to disk
			setFacebookData(allStudents);
			saveJson("students.json", allStudents);

			// Run validation
			const validation = validateFacebook(allStudents);
			sendSSE(res, {
				type: "validation",
				message: `Validation: ${validation.passes.length} passed, ${validation.warnings.length} warnings, ${validation.failures.length} failures`,
				data: validation,
			});

			sendSSE(res, {
				type: "complete",
				message: `Facebook scrape complete: ${allStudents.length} students`,
				count: allStudents.length,
				total: allStudents.length,
			});
		} catch (e) {
			console.error("Facebook scrape error:", e);
			sendSSE(res, { type: "error", message: `Fatal error: ${(e as Error).message}` });
		}

		res.end();
	};

	#scrapeDirectory = async (req: Request, res: Response): Promise<void> => {
		setupSSE(res);

		try {
			const { cookie, delay = 300 } = req.body as { cookie: string; delay?: number };

			if (!cookie) {
				sendSSE(res, { type: "error", message: "Missing cookie in request body" });
				res.end();
				return;
			}

			const fbData = getFacebookData();
			if (!fbData) {
				sendSSE(res, { type: "error", message: "No facebook data in state. Run facebook scrape first." });
				res.end();
				return;
			}

			const source = new DirectorySource(cookie);

			sendSSE(res, { type: "progress", message: "Fetching CSRF token...", count: 0, total: fbData.length });
			await source.fetchCsrfToken();
			sendSSE(res, { type: "progress", message: "Got CSRF token. Starting enrichment...", count: 0, total: fbData.length });

			// Replicate enrichment loop from DirectorySource.enrich() with SSE progress
			const enriched: EnrichedStudent[] = fbData.map((s) => ({ ...s })) as EnrichedStudent[];
			let enrichedCount = 0;
			let notFound = 0;
			let multiMatch = 0;
			let errors = 0;
			let requestsSinceCsrf = 0;

			for (let i = 0; i < enriched.length; i++) {
				const student = enriched[i];
				const first = student.first_name;
				const last = student.last_name;

				if (!first || !last) {
					notFound++;
					continue;
				}

				// Periodically refresh CSRF token
				requestsSinceCsrf++;
				if (requestsSinceCsrf >= CSRF_REFRESH_INTERVAL) {
					try {
						await source.fetchCsrfToken();
						requestsSinceCsrf = 0;
					} catch (e) {
						console.error("CSRF refresh failed:", e);
					}
				}

				try {
					const records: DirectoryRecord[] = await source.searchPerson(first, last);

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
						try {
							await source.fetchCsrfToken();
							requestsSinceCsrf = 0;
						} catch {
							sendSSE(res, { type: "error", message: `Session expired at student ${i}. Could not refresh.` });
							// Store partial results
							setEnrichedData(enriched);
			saveJson("students_enriched.json", enriched);
							sendSSE(res, {
								type: "complete",
								message: `Enrichment stopped at ${i}/${enriched.length}. Partial results saved.`,
								count: i,
								total: enriched.length,
							});
							res.end();
							return;
						}
					} else {
						errors++;
					}
				}

				// Send progress every 10 students
				if ((i + 1) % 10 === 0) {
					sendSSE(res, {
						type: "progress",
						message: `Progress: ${i + 1}/${enriched.length} | enriched=${enrichedCount} not_found=${notFound} multi=${multiMatch} errors=${errors}`,
						count: i + 1,
						total: enriched.length,
					});
				}

				await sleep(delay);
			}

			// Store in state
			setEnrichedData(enriched);
			saveJson("students_enriched.json", enriched);

			// Run validation
			const validation = validateEnriched(enriched);
			sendSSE(res, {
				type: "validation",
				message: `Validation: ${validation.passes.length} passed, ${validation.warnings.length} warnings, ${validation.failures.length} failures`,
				data: validation,
			});

			sendSSE(res, {
				type: "complete",
				message: `Directory enrichment complete: ${enrichedCount} enriched, ${notFound} not found, ${errors} errors`,
				count: enriched.length,
				total: enriched.length,
			});
		} catch (e) {
			console.error("Directory scrape error:", e);
			sendSSE(res, { type: "error", message: `Fatal error: ${(e as Error).message}` });
		}

		res.end();
	};
}

// Replicated from directory.ts to avoid modifying the source
function enrichStudent(student: EnrichedStudent, record: DirectoryRecord): void {
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

function matchRecord(student: FacebookStudent, records: DirectoryRecord[]): DirectoryRecord | null {
	const studentCollege = student.college?.toLowerCase() || "";
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

		if (recCollege && recCollege === studentCollege) score += 2;
		if (studentYearInt && recYear && Number(recYear) === studentYearInt) score += 1;
		if (rec.PrimarySchoolCode === "YC") score += 1;

		if (score > bestScore) {
			bestScore = score;
			bestRecord = rec;
		}
	}

	return bestRecord;
}
