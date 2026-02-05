import express, {Request, Response} from "express";
import PersonModel, { PERSON_ALLOWED_FILTER_FIELDS } from "../models/PersonModel.js";
import { Op, Sequelize, WhereOptions } from "sequelize";
import CAS from "../cas.js";
import Elasticsearch from "../elasticsearch.js";

export default class PeopleRouter {
	#elasticsearch: Elasticsearch;

	constructor(elasticsearch: Elasticsearch) {
		this.#elasticsearch = elasticsearch;
	}

	getRouter = () => {
		const router = express.Router();
		router.post("/", CAS.requireAuthentication, this.getPeople);
		return router;
	};

	constructInitialsQuery = (initials: string) => {
		initials = initials.toUpperCase();
		return {
			[Op.and]: [
				Sequelize.where(
					Sequelize.fn("UPPER", Sequelize.fn("LEFT", Sequelize.col("first_name"), 1)),
					initials[0],
				),
				Sequelize.where(
					Sequelize.fn("UPPER", Sequelize.fn("LEFT", Sequelize.col("last_name"), 1)),
					initials[1],
				),
			],
		};
	};

	getPeople = async (req: Request, res: Response) => {
		const query = req.body.query || "";
		const filtersRaw = req.body.filters || {};
		const page = req.body.page || 0;
		const pageSize = req.body.page_size || 100;

		if(pageSize > 100 || pageSize < 1) {
			res.status(400).send("Page size must be between 1 and 100");
			return;
		}

		// Go through filters and construct a where query
		let where: WhereOptions<PersonModel> = {};
		for(const field of Object.keys(filtersRaw)) {
			if(!PERSON_ALLOWED_FILTER_FIELDS.includes(field)) {
				res.status(400).send(`Cannot filter by field ${field}`);
				return;
			}
			if(Array.isArray(filtersRaw[field])) {
				where = {
					...where,
					[field]: {
						[Op.in]: filtersRaw[field],
					},
				};
			} else {
				where = {
					...where,
					[field]: filtersRaw[field],
				};
			}
		}

		let exactNetids: string[] = [];
		let fuzzyNetids: string[] = [];

		if(query) { // Fuzzy search using trigrams
			// Check if query is initials (2 letters)
			if(query.match(/^[a-z]{2}$/i)) {
				where = {
					...where,
					...this.constructInitialsQuery(query),
				};
			} else {
				exactNetids = await this.#elasticsearch.searchPersonByNameFuzzy(query, false);
				fuzzyNetids = await this.#elasticsearch.searchPersonByNameFuzzy(query, true);
				where = {
					...where,
					netid: [...exactNetids, ...fuzzyNetids],
				};
			}
		}

		let people: PersonModel[];
		try {
			people = await PersonModel.findAll({
				where,
				limit: pageSize,
				offset: page * pageSize,
			});
		} catch(e) {
			console.error(e);
			res.status(500).send("Error fetching people");
			return;
		}
		const json = people.map((person) => person.toSanitizedObject());
		if(fuzzyNetids.length > 0) {
			json.sort((a, b) => {
				const aIsInExact = exactNetids.includes(a.netid);
				const bIsInExact = exactNetids.includes(b.netid);
				if(aIsInExact === bIsInExact) return 0;
				if(aIsInExact) return -1;
				if(bIsInExact) return 1;
			});
		}
		res.status(200).json(json);
	};
};
