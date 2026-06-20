import { Router, Request, Response, NextFunction } from "express";
import { Sequelize, QueryTypes } from "sequelize";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { parseLocation } from "../parseLocation.js";
import { YALE_COLLEGE, YALE_COLLEGE_CODE } from "yalies-shared";

const GCS_BUCKET_NAME = "yalies-photos";
// Use an explicit key file only when configured (local dev); otherwise rely on
// Application Default Credentials (the runtime service account in the cloud).
const GCS_KEY_FILENAME = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (file.mimetype.startsWith("image/")) cb(null, true);
		else cb(new Error("Only image files are allowed"));
	},
});

// Translate multer rejections (oversized / non-image) into JSON responses.
const uploadPhotoMiddleware = (req: Request, res: Response, next: NextFunction) => {
	upload.single("photo")(req, res, (err: unknown) => {
		if (err instanceof multer.MulterError) {
			if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Photo must be under 5MB" });
			return res.status(400).json({ error: err.message });
		}
		if (err instanceof Error) return res.status(415).json({ error: err.message });
		return next();
	});
};

export default class DatabaseRouter {
	#router: Router;
	#gcs: Storage;

	constructor() {
		this.#gcs = new Storage(GCS_KEY_FILENAME ? { keyFilename: GCS_KEY_FILENAME } : {});
		this.#router = Router();
		this.#router.get("/overview", this.#overview);
		this.#router.get("/students", this.#students);
		this.#router.put("/students/:id", this.#updateStudent);
		this.#router.post("/students/:id/photo", uploadPhotoMiddleware, this.#uploadStudentPhoto);
		this.#router.get("/students/:id/photo/download", this.#downloadStudentPhoto);
		this.#router.delete("/students/:id", this.#deleteStudent);
		this.#router.post("/compute-locations", this.#computeLocations);
		this.#router.get("/change-requests", this.#getChangeRequests);
		this.#router.put("/change-requests/:id", this.#resolveChangeRequest);
	}

	getRouter = (): Router => this.#router;

	#getSequelize(): Sequelize {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) throw new Error("DATABASE_URL not set");
		return new Sequelize(databaseUrl, { logging: false });
	}

	#overview = async (_req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();

			const [[totals]] = await Promise.all([
				sequelize.query<{
					total: string;
					yc: string;
					with_netid: string;
					with_email: string;
					with_image: string;
					with_location: string;
				}>(
					`SELECT
						COUNT(*) as total,
						COUNT(*) FILTER (WHERE school = :yc OR school_code = :ycCode) as yc,
						COUNT(*) FILTER (WHERE netid IS NOT NULL) as with_netid,
						COUNT(*) FILTER (WHERE email IS NOT NULL) as with_email,
						COUNT(*) FILTER (WHERE image IS NOT NULL) as with_image,
						COUNT(*) FILTER (WHERE address_country IS NOT NULL) as with_location
					FROM person`,
					{ type: QueryTypes.SELECT, replacements: { yc: YALE_COLLEGE, ycCode: YALE_COLLEGE_CODE } },
				),
			]);

			const colleges = await sequelize.query<{ name: string; count: string }>(
				`SELECT college as name, COUNT(*) as count
				FROM person
				WHERE college IS NOT NULL AND college != ''
				GROUP BY college
				ORDER BY count DESC`,
				{ type: QueryTypes.SELECT },
			);

			const years = await sequelize.query<{ year: number; count: string }>(
				`SELECT year, COUNT(*) as count
				FROM person
				WHERE year IS NOT NULL
				GROUP BY year
				ORDER BY year`,
				{ type: QueryTypes.SELECT },
			);

			const schools = await sequelize.query<{ name: string; count: string }>(
				`SELECT school as name, COUNT(*) as count
				FROM person
				WHERE school IS NOT NULL AND school != ''
				GROUP BY school
				ORDER BY count DESC`,
				{ type: QueryTypes.SELECT },
			);

			const locations = await sequelize.query<{ name: string; count: string }>(
				`SELECT address_country as name, COUNT(*) as count
				FROM person
				WHERE address_country IS NOT NULL AND address_country != ''
				GROUP BY address_country
				ORDER BY count DESC`,
				{ type: QueryTypes.SELECT },
			);

			res.json({
				totalStudents: parseInt(totals.total),
				ycStudents: parseInt(totals.yc),
				withNetid: parseInt(totals.with_netid),
				withEmail: parseInt(totals.with_email),
				withImage: parseInt(totals.with_image),
				withLocation: parseInt(totals.with_location),
				colleges: colleges.map((c) => ({ name: c.name, count: parseInt(c.count) })),
				years: years.map((y) => ({ year: y.year, count: parseInt(y.count) })),
				schools: schools.map((s) => ({ name: s.name, count: parseInt(s.count) })),
				locations: locations.map((l) => ({ name: l.name, count: parseInt(l.count) })),
			});
		} catch (e) {
			console.error("Database overview error:", e);
			res.status(500).send(`Failed to load overview: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#students = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();

			const page = Math.max(1, parseInt(req.query.page as string) || 1);
			const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
			const offset = (page - 1) * pageSize;

			const search = (req.query.search as string || "").trim();
			const college = (req.query.college as string || "").trim();
			const year = (req.query.year as string || "").trim();
			const school = (req.query.school as string || "").trim();

			const conditions: string[] = [];
			const replacements: Record<string, string | number> = {};

			if (search) {
				const words = search.split(/\s+/).filter(Boolean);
				if (words.length === 1) {
					conditions.push(
						`(p.first_name ILIKE :search OR p.last_name ILIKE :search
						OR p.preferred_name ILIKE :search OR p.netid ILIKE :search
						OR p.email ILIKE :search)`,
					);
					replacements.search = `%${words[0]}%`;
					replacements.search_exact = words[0];
				} else {
					const wordConditions = words.map((w, i) => {
						const key = `sw${i}`;
						replacements[key] = `%${w}%`;
						return `(p.first_name ILIKE :${key} OR p.last_name ILIKE :${key}
							OR p.preferred_name ILIKE :${key} OR p.netid ILIKE :${key}
							OR p.email ILIKE :${key})`;
					});
					conditions.push(`(${wordConditions.join(" AND ")})`);
					replacements.search_exact = search;
				}
			}
			if (college) {
				conditions.push("p.college = :college");
				replacements.college = college;
			}
			if (year) {
				const y = parseInt(year, 10);
				if (!Number.isNaN(y)) {
					conditions.push("p.year = :year");
					replacements.year = y;
				}
			}
			if (school) {
				conditions.push("p.school = :school");
				replacements.school = school;
			}

			const whereClause = conditions.length > 0
				? `WHERE ${conditions.join(" AND ")}`
				: "";

			const [[countResult]] = await Promise.all([
				sequelize.query<{ count: string }>(
					`SELECT COUNT(*) as count FROM person p ${whereClause}`,
					{ type: QueryTypes.SELECT, replacements },
				),
			]);

			const orderClause = search
				? `ORDER BY
					CASE
						WHEN p.netid ILIKE :search_exact THEN 0
						WHEN p.email ILIKE :search_exact THEN 0
						WHEN LOWER(p.first_name || ' ' || p.last_name) = LOWER(:search_exact) THEN 0
						WHEN LOWER(p.last_name || ', ' || p.first_name) = LOWER(:search_exact) THEN 0
						WHEN p.first_name ILIKE :search_exact OR p.last_name ILIKE :search_exact THEN 1
						WHEN p.preferred_name ILIKE :search_exact THEN 1
						ELSE 2
					END,
					p.last_name, p.first_name`
				: "ORDER BY p.last_name, p.first_name";

			const students = await sequelize.query<Record<string, unknown>>(
				`SELECT p.*,
					up.linkedin_url, up.instagram_url, up.classes
				FROM person p
				LEFT JOIN user_profile up ON p.netid = up.netid
				${whereClause}
				${orderClause}
				LIMIT :limit OFFSET :offset`,
				{
					type: QueryTypes.SELECT,
					replacements: { ...replacements, limit: pageSize, offset },
				},
			);

			res.json({
				students,
				total: parseInt(countResult.count),
				page,
				pageSize,
			});
		} catch (e) {
			console.error("Database students error:", e);
			res.status(500).send(`Failed to load students: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#updateStudent = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const id = parseInt(req.params.id as string);
			if (isNaN(id)) { res.status(400).send("Invalid id"); return; }

			const ALLOWED_FIELDS = [
				"netid", "upi", "email", "mailbox", "phone", "fax",
				"title", "first_name", "preferred_name", "middle_name", "last_name",
				"suffix", "pronouns", "phonetic_name", "name_recording",
				"address", "residence", "school", "school_code", "year", "curriculum",
				"college", "college_code", "leave", "visitor",
				"birthday", "birth_month", "birth_day",
				"major", "access_code", "organization", "organization_code",
				"unit_class", "unit_code", "unit", "postal_address",
				"office_building", "office_room", "cv", "profile", "website",
				"education", "publications",
			];

			const sets: string[] = [];
			const replacements: Record<string, string | number | boolean | null> = { id };

			for (const field of ALLOWED_FIELDS) {
				if (field in req.body) {
					const val = req.body[field];
					sets.push(`${field} = :${field}`);
					replacements[field] = (val === "" || val === undefined) ? null : val;
				}
			}

			if (sets.length === 0 && !("linkedin_url" in req.body) && !("instagram_url" in req.body) && !("classes" in req.body)) {
				res.status(400).send("No fields to update"); return;
			}

			if (sets.length > 0) {
				await sequelize.query(
					`UPDATE person SET ${sets.join(", ")} WHERE id = :id`,
					{ type: QueryTypes.UPDATE, replacements },
				);
			}

			const profileFields = ["linkedin_url", "instagram_url", "classes"] as const;
			const hasProfileUpdate = profileFields.some((f) => f in req.body);
			if (hasProfileUpdate) {
				const [person] = await sequelize.query<{ netid: string }>(
					"SELECT netid FROM person WHERE id = :id",
					{ type: QueryTypes.SELECT, replacements: { id } },
				);
				if (person?.netid) {

					let linkedinVal: string | null = null;
					let instagramVal: string | null = null;
					let classesVal: string[] | null = null;

					if ("linkedin_url" in req.body) {
						const v = req.body.linkedin_url;
						linkedinVal = (v && v !== "") ? String(v) : null;
					}
					if ("instagram_url" in req.body) {
						const v = req.body.instagram_url;
						instagramVal = (v && v !== "") ? String(v) : null;
					}
					if ("classes" in req.body) {
						const v = req.body.classes;
						if (Array.isArray(v) && v.length > 0) {
							classesVal = v.map((s: string) => String(s).trim()).filter(Boolean);
							if (classesVal.length === 0) classesVal = null;
						} else if (typeof v === "string" && v.trim()) {
							classesVal = v.split(",").map((s: string) => s.trim()).filter(Boolean);
							if (classesVal.length === 0) classesVal = null;
						}
					}

					const classesPg = classesVal
						? `{${classesVal.map((s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`).join(",")}}`
						: null;

					await sequelize.query(
						`INSERT INTO user_profile (netid, linkedin_url, instagram_url, classes, updated_at)
						VALUES (:netid, :linkedin_url, :instagram_url, :classes, NOW())
						ON CONFLICT (netid) DO UPDATE SET
							linkedin_url = :linkedin_url,
							instagram_url = :instagram_url,
							classes = :classes,
							updated_at = NOW()`,
						{ replacements: {
							netid: person.netid,
							linkedin_url: linkedinVal,
							instagram_url: instagramVal,
							classes: classesPg,
						} },
					);
				}
			}

			const [updated] = await sequelize.query<Record<string, unknown>>(
				`SELECT p.*,
					up.linkedin_url, up.instagram_url, up.classes
				FROM person p
				LEFT JOIN user_profile up ON p.netid = up.netid
				WHERE p.id = :id`,
				{ type: QueryTypes.SELECT, replacements: { id } },
			);

			res.json(updated ?? { id });
		} catch (e) {
			console.error("Update student error:", e);
			res.status(500).send(`Failed to update student: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#uploadStudentPhoto = async (req: Request, res: Response): Promise<void> => {
		if (!req.file) { res.status(400).send("No photo uploaded"); return; }

		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const id = parseInt(req.params.id as string);
			if (isNaN(id)) { res.status(400).send("Invalid id"); return; }

			const [person] = await sequelize.query<{ image: string | null; netid: string | null }>(
				"SELECT image, netid FROM person WHERE id = :id",
				{ type: QueryTypes.SELECT, replacements: { id } },
			);
			if (!person) { res.status(404).send("Student not found"); return; }

			// Reuse the existing object name when it's a clean bucket object,
			// otherwise fall back to a deterministic per-student name.
			let filename = `${person.netid || id}.jpg`;
			if (person.image) {
				const candidate = person.image.split("?")[0].split("/").pop() ?? "";
				if (/^[\w.-]+\.(jpe?g|png|webp)$/i.test(candidate)) filename = candidate;
			}

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(filename);
			await file.save(req.file.buffer, { contentType: req.file.mimetype, metadata: { cacheControl: "no-store" } });

			const imageUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;
			await sequelize.query(
				"UPDATE person SET image = :image WHERE id = :id",
				{ type: QueryTypes.UPDATE, replacements: { image: imageUrl, id } },
			);

			res.json({ image: imageUrl });
		} catch (e) {
			console.error("Upload photo error:", e);
			res.status(500).send(`Failed to upload photo: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#downloadStudentPhoto = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const id = parseInt(req.params.id as string);
			if (isNaN(id)) { res.status(400).send("Invalid id"); return; }

			const [person] = await sequelize.query<{ image: string | null; first_name: string; last_name: string }>(
				"SELECT image, first_name, last_name FROM person WHERE id = :id",
				{ type: QueryTypes.SELECT, replacements: { id } },
			);
			if (!person?.image) { res.status(404).send("No photo found"); return; }

			const urlParts = person.image.split("/");
			const filename = urlParts[urlParts.length - 1];

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(filename);
			const [buffer] = await file.download();

			res.set("Content-Type", "image/jpeg");
			res.set("Content-Disposition", `attachment; filename="${person.first_name}_${person.last_name}.jpg"`);
			res.send(buffer);
		} catch (e) {
			console.error("Download photo error:", e);
			res.status(500).send(`Failed to download photo: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#deleteStudent = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const id = parseInt(req.params.id as string);
			if (isNaN(id)) { res.status(400).send("Invalid id"); return; }

			await sequelize.query(
				"DELETE FROM person WHERE id = :id",
				{ type: QueryTypes.DELETE, replacements: { id } },
			);

			res.json({ success: true });
		} catch (e) {
			console.error("Delete student error:", e);
			res.status(500).send(`Failed to delete student: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#computeLocations = async (_req: Request, res: Response): Promise<void> => {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.flushHeaders();

		const send = (data: Record<string, unknown>) => {
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		};

		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();

			// Ensure columns exist
			await sequelize.query(`
				ALTER TABLE person
				ADD COLUMN IF NOT EXISTS address_state VARCHAR(10),
				ADD COLUMN IF NOT EXISTS address_country VARCHAR(255);
			`);

			send({ type: "progress", message: "Fetching all addresses..." });

			const rows = await sequelize.query<{ id: number; address: string | null }>(
				"SELECT id, address FROM person",
				{ type: QueryTypes.SELECT },
			);

			const total = rows.length;
			send({ type: "progress", message: `Processing ${total} records...`, total });

			let updated = 0;
			let withCountry = 0;
			let withState = 0;
			const countryCounts: Record<string, number> = {};

			// Process in batches of 500 for performance
			const BATCH_SIZE = 500;
			for (let i = 0; i < rows.length; i += BATCH_SIZE) {
				const batch = rows.slice(i, i + BATCH_SIZE);

				for (const row of batch) {
					const { address_state, address_country } = parseLocation(row.address);

					await sequelize.query(
						"UPDATE person SET address_state = :state, address_country = :country WHERE id = :id",
						{
							type: QueryTypes.UPDATE,
							replacements: {
								state: address_state,
								country: address_country,
								id: row.id,
							},
						},
					);

					updated++;
					if (address_country) {
						withCountry++;
						countryCounts[address_country] = (countryCounts[address_country] || 0) + 1;
					}
					if (address_state) withState++;
				}

				send({
					type: "progress",
					message: `Processed ${Math.min(i + BATCH_SIZE, total)} / ${total}`,
					count: Math.min(i + BATCH_SIZE, total),
					total,
				});
			}

			// Build top locations summary
			const topLocations = Object.entries(countryCounts)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 15)
				.map(([name, count]) => `${name}: ${count}`);

			send({
				type: "complete",
				message: `Done! Updated ${updated} records.`,
				stats: {
					total: updated,
					withCountry,
					withState,
					noLocation: updated - withCountry,
					topLocations,
				},
			});
		} catch (e) {
			console.error("Compute locations error:", e);
			send({ type: "error", message: `Failed: ${(e as Error).message}` });
		} finally {
			if (sequelize) await sequelize.close();
			res.end();
		}
	};

	#getChangeRequests = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const status = (req.query.status as string) || "pending";
			const page = Math.max(1, parseInt(req.query.page as string) || 1);
			const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
			const offset = (page - 1) * pageSize;

			const [[countResult]] = await Promise.all([
				sequelize.query<{ count: string }>(
					"SELECT COUNT(*) as count FROM data_change_request WHERE status = :status",
					{ type: QueryTypes.SELECT, replacements: { status } },
				),
			]);

			const requests = await sequelize.query<Record<string, unknown>>(
				`SELECT dcr.*,
					p.first_name || ' ' || p.last_name as requester_name
				FROM data_change_request dcr
				LEFT JOIN person p ON dcr.requester_netid = p.netid
				WHERE dcr.status = :status
				ORDER BY dcr.created_at DESC
				LIMIT :limit OFFSET :offset`,
				{ type: QueryTypes.SELECT, replacements: { status, limit: pageSize, offset } },
			);

			// Also return total pending count for badge display
			const [[pendingCount]] = await Promise.all([
				sequelize.query<{ count: string }>(
					"SELECT COUNT(*) as count FROM data_change_request WHERE status = 'pending'",
					{ type: QueryTypes.SELECT },
				),
			]);

			res.json({
				requests,
				total: parseInt(countResult.count),
				pendingCount: parseInt(pendingCount.count),
				page,
				pageSize,
			});
		} catch (e) {
			console.error("Change requests error:", e);
			res.status(500).send(`Failed to load change requests: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};

	#resolveChangeRequest = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const id = parseInt(req.params.id as string);
			if (isNaN(id)) { res.status(400).send("Invalid id"); return; }

			const { status, admin_notes, modified_changes } = req.body;
			if (status !== "approved" && status !== "denied") {
				res.status(400).send("Status must be 'approved' or 'denied'"); return;
			}

			// Fetch the request, ensuring it's still pending
			const [request] = await sequelize.query<{
				id: number;
				target_netid: string;
				requested_changes: Record<string, string | number | null>;
				status: string;
			}>(
				`SELECT id, target_netid, requested_changes, status
				FROM data_change_request WHERE id = :id`,
				{ type: QueryTypes.SELECT, replacements: { id } },
			);

			if (!request) { res.status(404).send("Request not found"); return; }
			if (request.status !== "pending") { res.status(409).send("Request already resolved"); return; }

			const transaction = await sequelize.transaction();

			if (status === "approved") {
				const changes = modified_changes || request.requested_changes;

				const ALLOWED_FIELDS = [
					"netid", "upi", "email", "mailbox", "phone", "fax",
					"title", "first_name", "preferred_name", "middle_name", "last_name",
					"suffix", "pronouns", "phonetic_name", "name_recording",
					"address", "residence", "school", "school_code", "year", "curriculum",
					"college", "college_code", "leave", "visitor",
					"birthday", "birth_month", "birth_day",
					"major", "access_code", "organization", "organization_code",
					"unit_class", "unit_code", "unit", "postal_address",
					"office_building", "office_room", "cv", "profile", "website",
					"education", "publications",
				];

				const sets: string[] = [];
				const replacements: Record<string, string | number | boolean | null> = {
					target_netid: request.target_netid,
				};

				for (const [field, value] of Object.entries(changes)) {
					if (ALLOWED_FIELDS.includes(field)) {
						sets.push(`${field} = :${field}`);
						replacements[field] = (value === "" || value === undefined) ? null : value as string | number | boolean;
					}
				}

				if (sets.length > 0) {
					await sequelize.query(
						`UPDATE person SET ${sets.join(", ")} WHERE netid = :target_netid`,
						{ type: QueryTypes.UPDATE, replacements, transaction },
					);
				}
			}

			// Update the request status (atomic with the person update above)
			await sequelize.query(
				`UPDATE data_change_request
				SET status = :status, admin_notes = :admin_notes,
					resolved_at = NOW(), resolved_by = :resolved_by
				WHERE id = :id AND status = 'pending'`,
				{
					type: QueryTypes.UPDATE,
					replacements: {
						id,
						status,
						admin_notes: admin_notes || null,
						resolved_by: req.netid || "admin",
					},
					transaction,
				},
			);

			await transaction.commit();

			const [updated] = await sequelize.query<Record<string, unknown>>(
				"SELECT * FROM data_change_request WHERE id = :id",
				{ type: QueryTypes.SELECT, replacements: { id } },
			);

			res.json(updated);
		} catch (e) {
			console.error("Resolve change request error:", e);
			res.status(500).send(`Failed to resolve change request: ${(e as Error).message}`);
		} finally {
			if (sequelize) await sequelize.close();
		}
	};
}
