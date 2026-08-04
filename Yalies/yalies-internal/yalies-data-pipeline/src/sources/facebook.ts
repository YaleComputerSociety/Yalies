import https from "https";
import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { File, Storage } from "@google-cloud/storage";
import { FacebookStudent } from "../types.js";
import { httpGet } from "../httpClient.js";
import { sleep } from "../util.js";

const BASE_URL = "https://students.yale.edu/facebook";
const PHOTO_PAGE_URL = `${BASE_URL}/PhotoPageNew`;
const PHOTO_URL = `${BASE_URL}/Photo`;
const GCS_BUCKET_NAME = "yalies-photos";

const BIRTHDAY_PATTERN = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/;
const PHONE_PATTERN = /^\d+-\d+/;
const ADDRESS_PATTERN = /[\d,]/;
const IMAGE_PREFIX_BYTES = 12;
const EXISTING_PHOTO_CHECK_CONCURRENCY = 40;

export function isSupportedImageBuffer(buffer: Buffer): boolean {
	if(buffer.length < IMAGE_PREFIX_BYTES) return false;
	const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
	const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	const isGif = buffer.subarray(0, 6).toString("ascii") === "GIF87a"
		|| buffer.subarray(0, 6).toString("ascii") === "GIF89a";
	const isWebp = buffer.subarray(0, 4).toString("ascii") === "RIFF"
		&& buffer.subarray(8, 12).toString("ascii") === "WEBP";
	return isJpeg || isPng || isGif || isWebp;
}

export function isPlaceholderCookie(cookie: string): boolean {
	return cookie.trim().length === 0
		|| /<[^>]*(?:jsessionid|cookie)[^>]*>/i.test(cookie)
		|| /current\s+jsessionid|full\s+cookie\s+header/i.test(cookie);
}

// Known countries/locations that get misidentified as majors because they lack digits/commas
import { COUNTRY_ALIASES, US_STATES, YALE_COLLEGE } from "yalies-shared";
const KNOWN_LOCATIONS = new Set([
	...Object.values(COUNTRY_ALIASES).map(c => c.toLowerCase()),
	...Object.values(US_STATES).map(s => s.toLowerCase()),
	"romania", "brazil", "indonesia", "japan", "mongolia", "morocco", "ukraine",
	"china", "india", "south korea", "taiwan", "hong kong", "singapore", "malaysia",
	"vietnam", "thailand", "philippines", "cambodia", "myanmar", "nepal", "sri lanka",
	"bangladesh", "pakistan", "iran", "iraq", "israel", "turkey", "saudi arabia",
	"united arab emirates", "qatar", "kuwait", "bahrain", "oman", "yemen", "jordan",
	"lebanon", "syria", "egypt", "nigeria", "ghana", "kenya", "south africa",
	"ethiopia", "tanzania", "uganda", "rwanda", "tunisia", "algeria",
	"zimbabwe", "mexico", "canada", "colombia", "argentina", "peru",
	"chile", "ecuador", "venezuela", "bolivia", "paraguay", "uruguay", "cuba",
	"jamaica", "haiti", "dominican republic", "trinidad", "guatemala", "honduras",
	"costa rica", "panama", "bermuda", "barbados", "germany", "france", "italy",
	"spain", "portugal", "netherlands", "belgium", "austria", "switzerland",
	"sweden", "norway", "denmark", "finland", "ireland", "poland", "hungary",
	"czech republic", "greece", "russia", "australia", "new zealand",
	"georgia", "armenia", "azerbaijan", "kazakhstan", "uzbekistan",
]);
const US_CITY_STATE_REGEX = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}$/;

function isLocationLine(line: string): boolean {
	if (ADDRESS_PATTERN.test(line)) return true;
	if (KNOWN_LOCATIONS.has(line.toLowerCase())) return true;
	if (US_CITY_STATE_REGEX.test(line)) return true;
	return false;
}

function parseDetails(parts: string[], data: Partial<FacebookStudent>): void {
	const filtered = parts
		.map((p) => decode(p.replace(/<[^>]+>/g, "").trim()))
		.filter((p) => p.length > 0);

	if (filtered.length === 0) return;

	let idx = 0;

	if (PHONE_PATTERN.test(filtered[idx])) {
		data.phone = filtered[idx].replace(/\s*\/\s*$/, "");
		idx++;
	}

	let remaining: string[];
	if (filtered.length > 0 && BIRTHDAY_PATTERN.test(filtered[filtered.length - 1])) {
		data.birthday = filtered[filtered.length - 1];
		remaining = filtered.slice(idx, -1);
	} else {
		remaining = filtered.slice(idx);
	}

	if (remaining.length === 0) return;

	let major: string | undefined;
	let addressLines: string[] = [];

	for (let i = remaining.length - 1; i >= 0; i--) {
		if (major === undefined && !isLocationLine(remaining[i])) {
			major = remaining[i];
			addressLines = remaining.slice(0, i);
			break;
		}
	}

	if (major === undefined) {

		addressLines = remaining;
	}

	if (major) data.major = major;
	if (addressLines.length > 0) data.address = addressLines.join(" | ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStudentCard($: cheerio.CheerioAPI, card: any, selectedOrganization?: string): FacebookStudent {
	const data: Partial<FacebookStudent> = {};

	const nameTag = $(card).find("h5.yalehead");
	if (nameTag.length) {
		const full = nameTag.text().trim();
		data.full_name = full;
		if (full.includes(",")) {
			const [last, first] = full.split(",", 2);
			data.last_name = last.trim();
			data.first_name = first.trim();
		} else {
			data.last_name = full;
			data.first_name = "";
		}
	}

	const yearTag = $(card).find(".student_year");
	if (yearTag.length) {
		data.year = yearTag.text().trim();
	}

	const pronounTag = $(card).find(".student_info_pronoun");
	if (pronounTag.length) {
		data.pronouns = pronounTag.text().trim();
	}

	const imgTag = $(card).find(".student_img img");
	if (imgTag.length) {
		const src = imgTag.attr("src") || "";
		const match = src.match(/id=(\d+)/);
		if (match) data.photo_id = match[1];
	}

	const infoDivs = $(card).find(".student_info");
	if (infoDivs.length >= 1) {
		data.college = $(infoDivs[0]).text().trim();
	}
	if (infoDivs.length >= 2) {
		const raw = $(infoDivs[1]).html() || "";
		const parts = raw.split(/<br\s*\/?>/i).map((p) => p.trim()).filter((p) => p.length > 0);
		data.details_raw = parts.join(" | ");
		parseDetails(parts, data);
	} else if (infoDivs.length === 1) {
		// A residential-college-filtered view omits the otherwise redundant
		// college block. Recover it from the selected organization and treat the
		// sole block as the normal details block.
		if (selectedOrganization && selectedOrganization !== YALE_COLLEGE) {
			data.college = selectedOrganization;
		}
		const raw = $(infoDivs[0]).html() || "";
		const parts = raw.split(/<br\s*\/?>/i).map((p) => p.trim()).filter((p) => p.length > 0);
		data.details_raw = parts.join(" | ");
		parseDetails(parts, data);
	}

	return data as FacebookStudent;
}

export function parseFacebookPage(html: string): FacebookStudent[] {
	const $ = cheerio.load(html);
	const selectedOrganization = $("select[name=orgSelect] option:selected").attr("value");
	return $(".student_container").toArray().map((card) => parseStudentCard($, card, selectedOrganization));
}

export default class FacebookSource {
	#cookie: string;

	constructor(cookie: string) {
		if(isPlaceholderCookie(cookie)) {
			throw new Error(
				"--facebook-cookie still contains the documentation placeholder. "
				+ "Copy the current JSESSIONID value or full Cookie request header from an authenticated students.yale.edu request.",
			);
		}
		this.#cookie = cookie;
	}

	#buildHeaders = (): Record<string, string> => ({
		"User-Agent": process.env.FACEBOOK_USER_AGENT
			|| "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
		// A bare value is the normal JSESSIONID input. Cloudflare-protected sessions
		// may require the caller to provide the complete Cookie header instead.
		"Cookie": this.#cookie.includes("=") ? this.#cookie : `JSESSIONID=${this.#cookie}`,
		"Referer": BASE_URL,
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
	});

	#fetchPhotoBuffer = (photoId: string, maxRedirects = 5): Promise<Buffer> => {
		const headers = this.#buildHeaders();
		const followRedirects = (url: string, remaining: number): Promise<Buffer> => {
			return new Promise((resolve, reject) => {
				https.get(url, { headers }, (res) => {
					if(res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
						res.resume();
						const next = res.headers.location.startsWith("http")
							? res.headers.location
							: new URL(res.headers.location, url).href;
						if(new URL(next).origin !== new URL(PHOTO_URL).origin) {
							reject(new Error("photo request redirected to Yale CAS; the Facebook cookie is missing or expired"));
							return;
						}
						if(remaining <= 0) {
							reject(new Error("photo request exceeded the redirect limit"));
							return;
						}
						resolve(followRedirects(next, remaining - 1));
						return;
					}
					if (res.statusCode !== 200) {
						res.resume();
						reject(new Error(`photo request returned HTTP ${res.statusCode ?? "unknown"}`));
						return;
					}
					const chunks: Buffer[] = [];
					res.on("data", (chunk: Buffer) => chunks.push(chunk));
					res.on("end", () => {
						const buffer = Buffer.concat(chunks);
						const contentType = String(res.headers["content-type"] || "");
						if(!contentType.toLowerCase().startsWith("image/") || !isSupportedImageBuffer(buffer)) {
							reject(new Error(`photo response was not an image (Content-Type: ${contentType || "missing"})`));
							return;
						}
						resolve(buffer);
					});
					res.on("error", reject);
				}).on("error", reject);
			});
		};
		return followRedirects(`${PHOTO_URL}?id=${photoId}`, maxRedirects);
	};

	#storedPhotoIsValid = (file: File): Promise<boolean> => {
		return new Promise((resolve) => {
			const chunks: Buffer[] = [];
			file.createReadStream({ start: 0, end: IMAGE_PREFIX_BYTES - 1 })
				.on("data", (chunk: Buffer) => chunks.push(chunk))
				.on("end", () => resolve(isSupportedImageBuffer(Buffer.concat(chunks))))
				.on("error", () => resolve(false));
		});
	};

	fetchPage = async (
		currentIndex: number,
		numberToGet?: number,
		referer = BASE_URL,
	): Promise<{ students: FacebookStudent[]; html: string }> => {

		const params = new URLSearchParams({ currentIndex: String(currentIndex) });
		if (numberToGet !== undefined) {
			params.set("numberToGet", String(numberToGet));
		}

		const url = `${PHOTO_PAGE_URL}?${params.toString()}`;
		const response = await httpGet(url, { ...this.#buildHeaders(), Referer: referer });

		if (response.status >= 300 && response.status < 400) {
			throw new Error("Session expired. Update JSESSIONID cookie and try again.");
		}

		const html = response.body;

		if (html.includes("cas/login")) {
			throw new Error("Session expired. Update JSESSIONID cookie and try again.");
		}

		const students = parseFacebookPage(html);
		return { students, html };
	};

	scrape = async (): Promise<FacebookStudent[]> => {
		console.log("Scraping Yale Facebook...");
		console.log("Attempting to fetch all students in one request...");

		const { students } = await this.fetchPage(-1, -1);
		console.log(`Got ${students.length} students`);

		if (students.length < 100) {
			throw new Error(`Only ${students.length} students scraped — expected thousands. Check your cookie.`);
		}

		return students;
	};

	uploadPhotos = async (students: FacebookStudent[], delay = 500): Promise<number> => {
		const storage = new Storage();
		const bucket = storage.bucket(GCS_BUCKET_NAME);

		const [files] = await bucket.getFiles();
		const existing = new Set(files.map((f) => f.name));
		console.log(`Uploading photos to gs://${GCS_BUCKET_NAME}/ (${existing.size} already exist)...`);

		const expectedNames = [...new Set(students
			.map((student) => student.photo_id)
			.filter((photoId) => photoId && photoId !== "0")
			.map((photoId) => `${photoId}.jpg`))];
		const relevantExisting = expectedNames.filter((name) => existing.has(name));
		const invalidExisting = new Set<string>();
		console.log(`Verifying ${relevantExisting.length} existing roster photos...`);
		for(let start = 0; start < relevantExisting.length; start += EXISTING_PHOTO_CHECK_CONCURRENCY) {
			const names = relevantExisting.slice(start, start + EXISTING_PHOTO_CHECK_CONCURRENCY);
			const results = await Promise.all(names.map(async (name) => ({
				name,
				valid: await this.#storedPhotoIsValid(bucket.file(name)),
			})));
			for(const result of results) {
				if(!result.valid) invalidExisting.add(result.name);
			}
		}
		for(const name of invalidExisting) existing.delete(name);
		if(invalidExisting.size > 0) {
			console.warn(`Found ${invalidExisting.size} corrupt existing photo objects; they will be replaced.`);
		}

		const firstCandidate = students.find((student) => {
			const photoId = student.photo_id;
			return photoId && photoId !== "0" && !existing.has(`${photoId}.jpg`);
		});
		let preflight: { photoId: string; buffer: Buffer } | null = null;
		if(firstCandidate?.photo_id) {
			try {
				preflight = {
					photoId: firstCandidate.photo_id,
					buffer: await this.#fetchPhotoBuffer(firstCandidate.photo_id),
				};
			} catch(error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Photo download preflight failed: ${message}. No photo objects were changed.`);
			}
		}

		let uploaded = 0;
		let failed = 0;
		for (let i = 0; i < students.length; i++) {
			const pid = students[i].photo_id;
			if (!pid || pid === "0" || existing.has(`${pid}.jpg`)) continue;

			try {
				const photoBuffer = preflight?.photoId === pid
					? preflight.buffer
					: await this.#fetchPhotoBuffer(pid);
				const file = bucket.file(`${pid}.jpg`);
				await file.save(photoBuffer, {
					contentType: "image/jpeg",
					metadata: { cacheControl: "public, max-age=3600" },
				});
				existing.add(`${pid}.jpg`);
				uploaded++;
			} catch(error) {
				failed++;
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`  Failed photo ${pid}: ${message}`);
				if(/CAS|cookie|not an image/i.test(message)) {
					throw new Error(`Photo session became invalid after ${uploaded} uploads: ${message}`);
				}
			}

			if ((i + 1) % 100 === 0) {
				console.log(`  Progress: ${i + 1}/${students.length} checked, ${uploaded} uploaded`);
			}
			await sleep(delay);
		}

		console.log(`Uploaded ${uploaded} photos to GCS (${failed} failed)`);
		return uploaded;
	};

	scrapePageByPage = async (delay = 0.5): Promise<FacebookStudent[]> => {
		console.log("Scraping Yale Facebook page by page...");

		const { students: firstPage, html } = await this.fetchPage(0);
		const $ = cheerio.load(html);
		const links = $(".jump_link a").toArray();
		const totalPages = links.length > 0 ? parseInt($(links[links.length - 1]).text().trim()) : 1;
		console.log(`Total pages: ${totalPages}, ~${totalPages * 12} students`);

		const allStudents = [...firstPage];
		console.log(`Page 1/${totalPages} - got ${firstPage.length} students`);

		for (let idx = 12; idx < totalPages * 12; idx += 12) {
			const pageNum = Math.floor(idx / 12) + 1;
			const { students } = await this.fetchPage(idx);
			allStudents.push(...students);
			console.log(`Page ${pageNum}/${totalPages} - got ${students.length} students (total: ${allStudents.length})`);
			await sleep(delay * 1000);
		}

		return allStudents;
	};
}
