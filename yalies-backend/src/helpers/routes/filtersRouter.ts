import express, {Request, Response} from "express";
import PersonModel from "../models/PersonModel.js";
import { col, fn } from "sequelize";

// We have to use this instead of PERSON_ALLOWED_FILTER_FIELDS
// because we want this route to remain public.
// If we used PERSON_ALLOWED_FILTER_FIELDS, any non-Yale person
// could get a list of names, etc.
export const DEFAULT_FILTER_FIELDS = ["school", "year", "college", "major"];

export default class FiltersRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.getFilters);
		return router;
	};

	getFilters = async (req: Request, res: Response) => {
		const filters: Record<string, unknown[]> = {};
		try {
			for (const category of DEFAULT_FILTER_FIELDS) {
				const distinctValues = await PersonModel.findAll({
					attributes: [[fn("DISTINCT", col(category)), category]],
					order: [[category, "ASC"]],
				});
				filters[category] = distinctValues
					.map(value => value.get(category))
					.filter(value => value !== null);
			}
		} catch (e) {
			console.error(e);
			res.status(500).send("Error fetching filters");
			return;
		}
		res.status(200).json(filters);
	};
};
