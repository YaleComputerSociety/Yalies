import https from "https";
import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { Storage } from "@google-cloud/storage";
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

function parseDetails(parts: string[], data: Partial<FacebookStudent>): void {
	const filtered = parts
		.map((p) => decode(p.replace(/<[^>]+>/g, "").trim()))
		.filter((p) => p.length > 0);

	if (filtered.length === 0) return;

	let idx = 0;

	// Check for phone (e.g. "6-2906 /")
	if (PHONE_PATTERN.test(filtered[idx])) {
		data.phone = filtered[idx].replace(/\s*\/\s*$/, "");
		idx++;
	}

	// Check for birthday at end
	let remaining: string[];
	if (filtered.length > 0 && BIRTHDAY_PATTERN.test(filtered[filtered.length - 1])) {
		data.birthday = filtered[filtered.length - 1];
		remaining = filtered.slice(idx, -1);
	} else {
		remaining = filtered.slice(idx);
	}

	if (remaining.length === 0) return;

	// Walk backwards: last non-address line is the major
	let major: string | undefined;
	let addressLines: string[] = [];

	for (let i = remaining.length - 1; i >= 0; i--) {
		if (major === undefined && !ADDRESS_PATTERN.test(remaining[i])) {
			major = remaining[i];
			addressLines = remaining.slice(0, i);
			break;
		}
	}

	if (major === undefined) {
		// Everything looks like address
		addressLines = remaining;
	}

	if (major) data.major = major;
	if (addressLines.length > 0) data.address = addressLines.join(" | ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStudentCard($: cheerio.CheerioAPI, card: any): FacebookStudent {
	const data: Partial<FacebookStudent> = {};

	// Name
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

	// Year
	const yearTag = $(card).find(".student_year");
	if (yearTag.length) {
		data.year = yearTag.text().trim();
	}

	// Pronouns
	const pronounTag = $(card).find(".student_info_pronoun");
	if (pronounTag.length) {
		data.pronouns = pronounTag.text().trim();
	}

	// Photo ID
	const imgTag = $(card).find(".student_img img");
	if (imgTag.length) {
		const src = imgTag.attr("src") || "";
		const match = src.match(/id=(\d+)/);
		if (match) data.photo_id = match[1];
	}

	// College and info
	const infoDivs = $(card).find(".student_info");
	if (infoDivs.length >= 1) {
		data.college = $(infoDivs[0]).text().trim();
	}
	if (infoDivs.length >= 2) {
		const raw = $(infoDivs[1]).html() || "";
		const parts = raw.split(/<br\s*\/?>/i).map((p) => p.trim()).filter((p) => p.length > 0);
		data.details_raw = parts.join(" | ");
		parseDetails(parts, data);
	}

	return data as FacebookStudent;
}

export default class FacebookSource {
	#cookie: string;

	constructor(cookie: string) {
		this.#cookie = cookie;
	}

	#buildHeaders = (): Record<string, string> => ({
		"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
		"Cookie": `JSESSIONID=${this.#cookie}`,
		"Referer": BASE_URL,
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
	});

	#fetchPhotoBuffer = (photoId: string): Promise<Buffer | null> => {
		const url = `${PHOTO_URL}?id=${photoId}`;
		return new Promise((resolve) => {
			https.get(url, { headers: this.#buildHeaders() }, (res) => {
				if (res.statusCode !== 200) {
					res.resume();
					resolve(null);
					return;
				}
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => resolve(Buffer.concat(chunks)));
				res.on("error", () => resolve(null));
			}).on("error", () => resolve(null));
		});
	};

	fetchPage = async (currentIndex: number, numberToGet?: number): Promise<{ students: FacebookStudent[]; html: string }> => {

		const params = new URLSearchParams({ currentIndex: String(currentIndex) });
		if (numberToGet !== undefined) {
			params.set("numberToGet", String(numberToGet));
		}

		const url = `${PHOTO_PAGE_URL}?${params.toString()}`;
		const response = await httpGet(url, this.#buildHeaders());

		if (response.status >= 300 && response.status < 400) {
			throw new Error("Session expired. Update JSESSIONID cookie and try again.");
		}

		const html = response.body;

		if (html.includes("cas/login")) {
			throw new Error("Session expired. Update JSESSIONID cookie and try again.");
		}

		const $ = cheerio.load(html);
		const cards = $(".student_container").toArray();
		const students = cards.map((card) => parseStudentCard($, card));
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

		// Get existing photos to skip re-uploads
		const [files] = await bucket.getFiles();
		const existing = new Set(files.map((f) => f.name));
		console.log(`Uploading photos to gs://${GCS_BUCKET_NAME}/ (${existing.size} already exist)...`);

		let uploaded = 0;
		for (let i = 0; i < students.length; i++) {
			const pid = students[i].photo_id;
			if (!pid || pid === "0" || existing.has(`${pid}.jpg`)) continue;

			try {
				const photoBuffer = await this.#fetchPhotoBuffer(pid);
				if (photoBuffer && photoBuffer.length > 100) {
					const file = bucket.file(`${pid}.jpg`);
					await file.save(photoBuffer, { contentType: "image/jpeg" });
					uploaded++;
				}
			} catch {
				// Skip failed photos
			}

			if ((i + 1) % 100 === 0) {
				console.log(`  Progress: ${i + 1}/${students.length} checked, ${uploaded} uploaded`);
			}
			await sleep(delay);
		}

		console.log(`Uploaded ${uploaded} photos to GCS`);
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
