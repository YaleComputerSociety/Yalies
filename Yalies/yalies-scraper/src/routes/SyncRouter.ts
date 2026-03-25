import { Router, Request, Response } from "express";
import { Sequelize, QueryTypes } from "sequelize";
import { loadToDatabase } from "../loadDb.js";
import { validateFacebook, validateEnriched, validateDatabase } from "../validate.js";
import {
	getFacebookData,
	getEnrichedData,
	getPreviewStats,
	getPreviewStudents,
} from "../state.js";

export default class SyncRouter {
	#router: Router;

	constructor() {
		this.#router = Router();
		this.#router.post("/", this.#syncToDatabase);
		this.#router.get("/preview", this.#preview);
		this.#router.get("/validate/:step", this.#validate);
	}

	getRouter = (): Router => this.#router;

	#syncToDatabase = async (_req: Request, res: Response): Promise<void> => {
		try {
			const enrichedData = getEnrichedData();
			if (!enrichedData) {
				res.status(400).send("No enriched data in state. Run facebook and directory scrapes first.");
				return;
			}

			const databaseUrl = process.env.DATABASE_URL;
			if (!databaseUrl) {
				res.status(500).send("DATABASE_URL environment variable not set");
				return;
			}

			await loadToDatabase(enrichedData, databaseUrl);
			res.json({ success: true, message: `Loaded ${enrichedData.length} students to database` });
		} catch (e) {
			console.error("Sync to database error:", e);
			res.status(500).send(`Database sync failed: ${(e as Error).message}`);
		}
	};

	#preview = async (_req: Request, res: Response): Promise<void> => {
		try {
			const stats = getPreviewStats();
			const students = getPreviewStudents(50);

			// Get current DB count for diff calculation
			let currentDbYcCount = 0;
			const databaseUrl = process.env.DATABASE_URL;
			if (databaseUrl) {
				const sequelize = new Sequelize(databaseUrl, { logging: false });
				try {
					const [result] = await sequelize.query<{ count: string }>(
						"SELECT COUNT(*) as count FROM person WHERE school = 'Yale College' OR school_code = 'YC'",
						{ type: QueryTypes.SELECT },
					);
					currentDbYcCount = parseInt(result.count);
				} finally {
					await sequelize.close();
				}
			}

			const totalStudents = (stats.totalStudents as number) || 0;

			// Run validations
			const validations: Record<string, unknown> = {};
			const fbData = getFacebookData();
			const enrichedData = getEnrichedData();
			if (fbData) validations.facebook = validateFacebook(fbData);
			if (enrichedData) validations.enriched = validateEnriched(enrichedData);

			res.json({
				...stats,
				currentDbYcCount,
				diff: {
					toAdd: totalStudents,
					toRemove: currentDbYcCount,
				},
				students,
				validations,
			});
		} catch (e) {
			console.error("Preview error:", e);
			res.status(500).send(`Preview failed: ${(e as Error).message}`);
		}
	};

	#validate = async (req: Request, res: Response): Promise<void> => {
		try {
			const step = req.params.step as string;

			if (step === "facebook") {
				const data = getFacebookData();
				if (!data) {
					res.status(400).send("No facebook data in state");
					return;
				}
				const result = validateFacebook(data);
				res.json(result);
			} else if (step === "enriched") {
				const data = getEnrichedData();
				if (!data) {
					res.status(400).send("No enriched data in state");
					return;
				}
				const result = validateEnriched(data);
				res.json(result);
			} else if (step === "database") {
				const databaseUrl = process.env.DATABASE_URL;
				if (!databaseUrl) {
					res.status(500).send("DATABASE_URL environment variable not set");
					return;
				}
				const result = await validateDatabase(databaseUrl);
				res.json(result);
			} else {
				res.status(400).send("Invalid step. Use: facebook, enriched, or database");
			}
		} catch (e) {
			console.error("Validation error:", e);
			res.status(500).send(`Validation failed: ${(e as Error).message}`);
		}
	};
}
