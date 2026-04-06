/**
 * Fetch photos from Yale Facebook for students who are missing images.
 * Tries each student's UPI as a photo ID.
 *
 * Usage:
 *   npx tsc && node build/fetchMissingPhotos.js --cookie <JSESSIONID>
 */

import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import https from "https";
import { Sequelize, QueryTypes } from "sequelize";
import { Storage } from "@google-cloud/storage";
import { sleep } from "./util.js";
import { YALE_COLLEGE, YALE_COLLEGE_CODE } from "yalies-shared";

const PHOTO_URL = "https://students.yale.edu/facebook/Photo";
const GCS_BUCKET_NAME = "yalies-photos";

type MissingStudent = {
	id: number;
	netid: string | null;
	first_name: string;
	last_name: string;
	upi: number | null;
};

function fetchPhoto(photoId: string, cookie: string): Promise<Buffer | null> {
	const headers = {
		"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
		"Cookie": `JSESSIONID=${cookie}`,
		"Referer": "https://students.yale.edu/facebook",
	};

	const follow = (url: string, remaining: number): Promise<Buffer | null> => {
		return new Promise((resolve) => {
			https.get(url, { headers }, (res) => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && remaining > 0) {
					res.resume();
					const next = res.headers.location.startsWith("http")
						? res.headers.location
						: new URL(res.headers.location, url).href;
					resolve(follow(next, remaining - 1));
					return;
				}
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

	return follow(`${PHOTO_URL}?id=${photoId}`, 5);
}

async function main() {
	const args = process.argv.slice(2);
	const cookieIdx = args.indexOf("--cookie");

	if (cookieIdx === -1 || !args[cookieIdx + 1]) {
		console.log("Usage: node build/fetchMissingPhotos.js --cookie <JSESSIONID>");
		return;
	}

	const cookie = args[cookieIdx + 1];
	const sequelize = new Sequelize(process.env.DATABASE_URL!, { logging: false });
	const storage = new Storage({
		keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
	});
	const bucket = storage.bucket(GCS_BUCKET_NAME);

	try {
		await sequelize.authenticate();
		console.log("Connected to database");

		const missing = await sequelize.query(
			`SELECT id, netid, first_name, last_name, upi FROM person
			 WHERE (school = '${YALE_COLLEGE}' OR school_code = '${YALE_COLLEGE_CODE}')
			   AND (image IS NULL OR image = '')
			   AND upi IS NOT NULL
			 ORDER BY last_name`,
			{ type: QueryTypes.SELECT },
		) as MissingStudent[];

		console.log(`Found ${missing.length} students without photos\n`);

		// Test cookie with first student
		console.log("Testing cookie...");
		const testBuffer = await fetchPhoto(String(missing[0].upi), cookie);
		if (!testBuffer || testBuffer.length < 100) {
			console.error("Cookie seems invalid — got no photo data. Check your JSESSIONID.");
			return;
		}
		console.log(`Cookie works (got ${testBuffer.length} bytes)\n`);

		let fetched = 0;
		let noPhoto = 0;
		let errors = 0;

		for (let i = 0; i < missing.length; i++) {
			const student = missing[i];
			const photoId = String(student.upi);

			try {
				const buffer = await fetchPhoto(photoId, cookie);

				if (buffer && buffer.length > 500) {
					// Upload to GCS
					const filename = `${photoId}.jpg`;
					const file = bucket.file(filename);
					await file.save(buffer, { contentType: "image/jpeg" });

					// Update DB
					const imageUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;
					await sequelize.query(
						`UPDATE person SET image = :image WHERE id = :id`,
						{ replacements: { image: imageUrl, id: student.id } },
					);
					fetched++;
				} else {
					noPhoto++;
				}
			} catch (e) {
				errors++;
			}

			if ((i + 1) % 50 === 0) {
				console.log(`Progress: ${i + 1}/${missing.length} | fetched=${fetched} no_photo=${noPhoto} errors=${errors}`);
			}

			await sleep(300);
		}

		console.log(`\nDone.`);
		console.log(`  Fetched & uploaded: ${fetched}`);
		console.log(`  No photo on Facebook: ${noPhoto}`);
		console.log(`  Errors: ${errors}`);

		const [remaining] = await sequelize.query(
			`SELECT COUNT(*) as cnt FROM person
			 WHERE (school = '${YALE_COLLEGE}' OR school_code = '${YALE_COLLEGE_CODE}')
			   AND (image IS NULL OR image = '')`,
			{ type: QueryTypes.SELECT },
		) as [{ cnt: string }];
		console.log(`  Still missing images: ${remaining.cnt}`);

	} finally {
		await sequelize.close();
	}
}

main().catch(err => {
	console.error("Fatal error:", err);
	process.exit(1);
});
