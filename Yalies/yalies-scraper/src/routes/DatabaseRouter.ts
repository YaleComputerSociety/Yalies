import { Router, Request, Response } from "express";
import { Sequelize, QueryTypes } from "sequelize";

export default class DatabaseRouter {
	#router: Router;

	constructor() {
		this.#router = Router();
		this.#router.get("/overview", this.#overview);
		this.#router.get("/students", this.#students);
		this.#router.put("/students/:id", this.#updateStudent);
		this.#router.delete("/students/:id", this.#deleteStudent);
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
				}>(
					`SELECT
						COUNT(*) as total,
						COUNT(*) FILTER (WHERE school = 'Yale College' OR school_code = 'YC') as yc,
						COUNT(*) FILTER (WHERE netid IS NOT NULL) as with_netid,
						COUNT(*) FILTER (WHERE email IS NOT NULL) as with_email,
						COUNT(*) FILTER (WHERE image IS NOT NULL) as with_image
					FROM person`,
					{ type: QueryTypes.SELECT },
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

			res.json({
				totalStudents: parseInt(totals.total),
				ycStudents: parseInt(totals.yc),
				withNetid: parseInt(totals.with_netid),
				withEmail: parseInt(totals.with_email),
				withImage: parseInt(totals.with_image),
				colleges: colleges.map((c) => ({ name: c.name, count: parseInt(c.count) })),
				years: years.map((y) => ({ year: y.year, count: parseInt(y.count) })),
				schools: schools.map((s) => ({ name: s.name, count: parseInt(s.count) })),
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
				conditions.push("p.year = :year");
				replacements.year = parseInt(year);
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
				: `ORDER BY p.last_name, p.first_name`;

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

			// Update person table fields
			if (sets.length > 0) {
				await sequelize.query(
					`UPDATE person SET ${sets.join(", ")} WHERE id = :id`,
					{ type: QueryTypes.UPDATE, replacements },
				);
			}

			// Update user_profile fields (linkedin_url, instagram_url, classes)
			const profileFields = ["linkedin_url", "instagram_url", "classes"] as const;
			const hasProfileUpdate = profileFields.some((f) => f in req.body);
			if (hasProfileUpdate) {
				const [person] = await sequelize.query<{ netid: string }>(
					`SELECT netid FROM person WHERE id = :id`,
					{ type: QueryTypes.SELECT, replacements: { id } },
				);
				if (person?.netid) {
					// Normalize values
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

					// Convert array to PG array literal since Sequelize raw queries don't bind arrays
					const classesPg = classesVal
						? `{${classesVal.map((s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`
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

	#deleteStudent = async (req: Request, res: Response): Promise<void> => {
		let sequelize: Sequelize | undefined;
		try {
			sequelize = this.#getSequelize();
			const id = parseInt(req.params.id as string);
			if (isNaN(id)) { res.status(400).send("Invalid id"); return; }

			await sequelize.query(
				`DELETE FROM person WHERE id = :id`,
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
}
