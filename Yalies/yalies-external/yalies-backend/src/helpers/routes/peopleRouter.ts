import express, {Request, Response} from "express";
import PersonModel, { PERSON_ALLOWED_FILTER_FIELDS } from "../models/PersonModel.js";
import { NETID_REGEX } from "yalies-shared";
import UserProfileModel from "../models/UserProfileModel.js";
import ProfileLikeModel from "../models/ProfileLikeModel.js";
import FriendshipModel from "../models/FriendshipModel.js";
import { Op, Sequelize, WhereOptions } from "sequelize";
import CAS from "../cas.js";
import Elasticsearch from "../elasticsearch.js";

const SEARCH_CACHE_MAX = 150;
const SEARCH_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const searchCache = new Map<string, { data: unknown[]; timestamp: number }>();

function getCacheKey(query: string, filters: Record<string, unknown>, page: number, pageSize: number): string {
	return JSON.stringify({ query, filters, page, pageSize });
}

function pruneCache() {
	if (searchCache.size <= SEARCH_CACHE_MAX) return;
	// Remove oldest entries
	const entries = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
	const toRemove = entries.slice(0, entries.length - SEARCH_CACHE_MAX);
	for (const [key] of toRemove) {
		searchCache.delete(key);
	}
}

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
		if (NETID_REGEX.test(query.toLowerCase())) {
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

		// Check search cache
		const cacheKey = getCacheKey(query, filtersRaw, page, pageSize);
		const cached = searchCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
			return res.status(200).json(cached.data);
		}

		// Go through filters and construct a where query
		let where: WhereOptions<PersonModel> = {};
		for(const field of Object.keys(filtersRaw)) {
			if(!(PERSON_ALLOWED_FILTER_FIELDS as readonly string[]).includes(field)) {
				res.status(400).send(`Cannot filter by field ${field}`);
				return;
			}
			// For country filter, also search raw address to catch entries where parseLocation missed
			if(field === "address_country") {
				const countries = Array.isArray(filtersRaw[field]) ? filtersRaw[field] : [filtersRaw[field]];
				const countryConditions = countries.map((c: string) => ({
					[Op.or]: [
						{ address_country: c },
						{ address: { [Op.iLike]: `%${c}%` } },
					],
				}));
				where = {
					...where,
					[Op.or]: countryConditions,
				};
			} else if(Array.isArray(filtersRaw[field])) {
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
				[exactNetids, fuzzyNetids] = await Promise.all([
					this.#elasticsearch.searchPersonByNameFuzzy(query, false),
					this.#elasticsearch.searchPersonByNameFuzzy(query, true),
				]);
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
					[Sequelize.literal("(id * 2654435761) % 2147483647"), "ASC"],
				],
				limit: pageSize,
				offset: page * pageSize,
			});
		} catch(e) {
			console.error(e);
			res.status(500).send("Error fetching people");
			return;
		}
		// Batch-fetch user profiles, likes, and friend status for all people
		const netids = people.map(p => p.netid).filter(Boolean);
		const currentUserNetid = req.netid;

		const [profiles, allLikes, myLikes, friendships] = await Promise.all([
			netids.length > 0
				? UserProfileModel.findAll({ where: { netid: { [Op.in]: netids } } })
				: [],
			netids.length > 0
				? ProfileLikeModel.findAll({
					where: { liked_netid: { [Op.in]: netids } },
					attributes: ["liked_netid", [Sequelize.fn("COUNT", Sequelize.col("liker_netid")), "count"]],
					group: ["liked_netid"],
				  })
				: [],
			currentUserNetid && netids.length > 0
				? ProfileLikeModel.findAll({
					where: { liker_netid: currentUserNetid, liked_netid: { [Op.in]: netids } },
				  })
				: [],
			currentUserNetid && netids.length > 0
				? FriendshipModel.findAll({
					where: {
						[Op.or]: [
							{ requester_netid: currentUserNetid, requested_netid: { [Op.in]: netids } },
							{ requester_netid: { [Op.in]: netids }, requested_netid: currentUserNetid },
						],
					},
				  })
				: [],
		]);

		const profileMap = new Map(profiles.map(p => [p.netid, p.toSanitizedObject()]));

		const likeCountMap = new Map<string, number>();
		for (const row of allLikes) {
			likeCountMap.set(row.get("liked_netid") as string, parseInt(row.get("count") as string));
		}
		const myLikeSet = new Set(myLikes.map(l => l.liked_netid));

		// Build friend status map
		const friendStatusMap = new Map<string, { status: string; count: number }>();
		// First get friend counts for all netids in batch
		const friendCountRows = netids.length > 0
			? await FriendshipModel.findAll({
				where: {
					status: "accepted",
					[Op.or]: [
						{ requester_netid: { [Op.in]: netids } },
						{ requested_netid: { [Op.in]: netids } },
					],
				},
			  })
			: [];
		const friendCountMap = new Map<string, number>();
		for (const row of friendCountRows) {
			friendCountMap.set(row.requester_netid, (friendCountMap.get(row.requester_netid) || 0) + 1);
			friendCountMap.set(row.requested_netid, (friendCountMap.get(row.requested_netid) || 0) + 1);
		}

		for (const netid of netids) {
			const friendship = friendships.find(f =>
				(f.requester_netid === currentUserNetid && f.requested_netid === netid) ||
				(f.requester_netid === netid && f.requested_netid === currentUserNetid)
			);
			let status: string = "none";
			if (friendship) {
				if (friendship.status === "accepted") status = "accepted";
				else if (friendship.requester_netid === currentUserNetid) status = "pending_sent";
				else status = "pending_received";
			}
			friendStatusMap.set(netid, { status, count: friendCountMap.get(netid) || 0 });
		}

		const json = people.map((person) => {
			const sanitized = person.toSanitizedObject();
			const profile = person.netid ? profileMap.get(person.netid) : undefined;
			const likeData = person.netid ? {
				like_count: likeCountMap.get(person.netid) || 0,
				liked_by_me: myLikeSet.has(person.netid),
			} : undefined;
			const friendData = person.netid ? friendStatusMap.get(person.netid) : undefined;
			return {
				...sanitized,
				...(profile && { user_profile: profile }),
				...(likeData && { like_data: likeData }),
				...(friendData && { friend_data: friendData }),
			};
		});

		if(fuzzyNetids.length > 0) {
			json.sort((a, b) => {
				const aIsInExact = exactNetids.includes(a.netid);
				const bIsInExact = exactNetids.includes(b.netid);
				if(aIsInExact === bIsInExact) return 0;
				if(aIsInExact) return -1;
				if(bIsInExact) return 1;
			});
		}

		// Cache the result
		searchCache.set(cacheKey, { data: json, timestamp: Date.now() });
		pruneCache();

		res.status(200).json(json);
	};
};
