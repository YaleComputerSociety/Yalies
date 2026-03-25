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
		router.get("/suggest", CAS.requireAuthentication, this.getSuggestions);
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

	getSuggestions = async (req: Request, res: Response) => {
		const query = (req.query.q as string || "").trim();
		if (query.length < 2) {
			res.status(200).json([]);
			return;
		}

		// For netID patterns, do a direct DB lookup
		if (query.match(/^[a-z]{2,}\d{1,4}$/i)) {
			try {
				const people = await PersonModel.findAll({
					where: { netid: query.toLowerCase() },
					limit: 1,
				});
				res.status(200).json(people.map((p) => ({
					netid: p.netid,
					first_name: p.first_name,
					last_name: p.last_name,
					image: p.image,
					college: p.college,
					year: p.year,
					school: p.school,
				})));
			} catch (e) {
				console.error("Error fetching suggestion for netid:", e);
				res.status(200).json([]);
			}
			return;
		}

		const suggestions = await this.#elasticsearch.suggestPerson(query, 8);

		// Validate suggestions against the DB to filter out stale ES records
		if (suggestions.length === 0) {
			res.status(200).json([]);
			return;
		}
		const netids = suggestions.map((s) => s.netid);
		const validPeople = await PersonModel.findAll({
			where: { netid: { [Op.in]: netids } },
			attributes: ["netid", "first_name", "last_name", "image", "college", "year", "school"],
		});
		const validMap = new Map(validPeople.map((p) => [p.netid, p]));
		// Preserve ES relevance ordering, skip stale entries
		const verified = netids
			.filter((id) => validMap.has(id))
			.map((id) => {
				const p = validMap.get(id)!;
				return {
					netid: p.netid,
					first_name: p.first_name,
					last_name: p.last_name,
					image: p.image,
					college: p.college,
					year: p.year,
					school: p.school,
				};
			});
		res.status(200).json(verified);
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
				const allNetids = [...new Set([...exactNetids, ...fuzzyNetids])];
				if (allNetids.length === 0) {
					res.status(200).json([]);
					return;
				}
				where = {
					...where,
					netid: { [Op.in]: allNetids },
				};
			}
		}

		let people: PersonModel[];
		try {
			people = await PersonModel.findAll({
				where,
				order: [
					[Sequelize.literal("image IS NULL OR image = ''"), "ASC"],
					[Sequelize.literal("md5(id::text || current_date::text)"), "ASC"],
				],
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
