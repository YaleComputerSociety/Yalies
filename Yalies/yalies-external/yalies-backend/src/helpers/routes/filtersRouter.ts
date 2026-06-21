import express, {Request, Response} from "express";
import PersonModel from "../models/PersonModel.js";
import { col, fn } from "sequelize";
import { DEFAULT_FILTER_FIELDS } from "yalies-shared";
import { getMockFilters, isMockDirectoryEnabled } from "../mockDirectory.js";

const CACHE_TTL_MS = 5 * 60 * 1000; 
let filtersCache: { data: Record<string, unknown[]>; timestamp: number } | null = null;

export default class FiltersRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.getFilters);
		return router;
	};

	getFilters = async (req: Request, res: Response) => {
		if (isMockDirectoryEnabled()) {
			return res.status(200).json(getMockFilters());
		}

		if (filtersCache && Date.now() - filtersCache.timestamp < CACHE_TTL_MS) {
			return res.status(200).json(filtersCache.data);
		}

		try {
			const results = await Promise.all(
				DEFAULT_FILTER_FIELDS.map(async (category) => {
					const values = await PersonModel.findAll({
						attributes: [[fn("DISTINCT", col(category)), category]],
						order: [[category, "ASC"]],
					});
					return [category, values.map(v => v.get(category)).filter(v => v !== null)] as const;
				})
			);
			const filters: Record<string, unknown[]> = {};
			for (const [category, values] of results) {
				filters[category] = values;
			}
			filtersCache = { data: filters, timestamp: Date.now() };
			res.status(200).json(filters);
		} catch (e) {
			console.error(e);
			res.status(500).send("Error fetching filters");
		}
	};
};
