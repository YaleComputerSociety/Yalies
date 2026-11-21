import express, {Request, Response} from "express";
import PersonModel, { PERSON_ALLOWED_FILTER_FIELDS } from "../models/PersonModel.js";
import { NETID_REGEX, type Person } from "yalies-shared";
import UserProfileModel from "../models/UserProfileModel.js";
import ProfileLikeModel from "../models/ProfileLikeModel.js";
import SavedContactModel from "../models/SavedContactModel.js";
import SavedListMemberModel from "../models/SavedListMemberModel.js";
import SavedListModel from "../models/SavedListModel.js";
import { Op, Sequelize, WhereOptions, type Order, type OrderItem } from "sequelize";
import CAS from "../cas.js";
import { findNameSearchIds, buildInitialsSearch, normalizeInitials, type NameSearchCandidate } from "../nameSearch.js";
import { searchProximity, type SearchPerson } from "../searchProximity.js";
import { buildExcludedFiltersWhere, buildLocationIncludesWhere, parseExcludedFilters, type ExcludedFilters } from "../filterExclusions.js";

import { withYaleMojiAvatars } from "../yalemojiAvatar.js";

const SEARCH_CACHE_MAX = 150;
const SEARCH_CACHE_TTL_MS = 60 * 1000; 
const RANDOM_ORDER_MODULUS = 2147483647;
const RANDOM_ORDER_MULTIPLIER = 2654435761;
const searchCache = new Map<string, { data: Person[]; timestamp: number }>();

function getCacheKey(netid: string | undefined, query: string, filters: Record<string, unknown>, excludedFilters: ExcludedFilters, page: number, pageSize: number, randomSeed: number | null, savedOwnerNetid: string | undefined): string {
	// netid is part of the key because the cached payload embeds per-user state
	// (liked_by_me, saved_data) — sharing it across users leaks data.
	return JSON.stringify({ netid, savedOwnerNetid, query, filters, excludedFilters, page, pageSize, randomSeed });
}

export function invalidateSearchCache(netid: string) {
	for(const key of searchCache.keys()) {
		if(JSON.parse(key).netid === netid) searchCache.delete(key);
	}
}

type SearchMode = "default" | "full_name" | "first_name" | "last_name" | "initials";
type SyntheticFilterField = "is_saved" | "saved_list" | "birthday" | "birth_date";

const SYNTHETIC_FILTER_FIELDS = new Set<SyntheticFilterField>(["is_saved", "saved_list", "birthday", "birth_date"]);
const BIRTHDAY_FILTER_DAYS: Record<string, number> = {
	today: 0,
	next_3_days: 3,
	next_1_week: 7,
	next_2_weeks: 14,
};

function isSearchMode(value: unknown): value is SearchMode {
	return value === "default" || value === "full_name" || value === "first_name" || value === "last_name" || value === "initials";
}

function getRandomSeed(value: unknown): number | null {
	const seed = Number(value);
	if(!Number.isInteger(seed) || seed < 1 || seed >= RANDOM_ORDER_MODULUS) return null;
	return seed;
}

function getPeopleOrder(randomSeed: number | null) {
	const multiplier = randomSeed === null
		? RANDOM_ORDER_MULTIPLIER
		: (RANDOM_ORDER_MULTIPLIER + randomSeed) % RANDOM_ORDER_MODULUS || RANDOM_ORDER_MULTIPLIER;
	const randomOrderExpression = randomSeed === null
		? "(id::bigint * 2654435761) % 2147483647"
		: `(id::bigint * ${multiplier}) % ${RANDOM_ORDER_MODULUS}`;

	return [
		[Sequelize.literal("image IS NULL OR image = ''"), "ASC"],
		[Sequelize.literal(randomOrderExpression), "ASC"],
	] as [ReturnType<typeof Sequelize.literal>, string][];
}

function getSearchOrder(query: string): OrderItem[] {
	const sequelize = PersonModel.sequelize;
	if(!sequelize) throw new Error("Person model must be initialized before searching");

	const normalizedQuery = query.trim().toLowerCase();
	const exact = sequelize.escape(normalizedQuery);
	const prefix = sequelize.escape(`${normalizedQuery}%`);

	return [
		[
			Sequelize.literal(`
				CASE
					WHEN LOWER(first_last_name(first_name, last_name)) = ${exact}
						OR LOWER(first_last_name(COALESCE(NULLIF(preferred_name, ''), first_name), last_name)) = ${exact}
						THEN 0
					WHEN LOWER(first_name) = ${exact}
						OR LOWER(preferred_name) = ${exact}
						OR LOWER(last_name) = ${exact}
						THEN 1
					WHEN LOWER(first_last_name(first_name, last_name)) LIKE ${prefix}
						OR LOWER(first_last_name(COALESCE(NULLIF(preferred_name, ''), first_name), last_name)) LIKE ${prefix}
						THEN 2
					WHEN LOWER(first_name) LIKE ${prefix}
						OR LOWER(preferred_name) LIKE ${prefix}
						OR LOWER(last_name) LIKE ${prefix}
						THEN 3
					ELSE 4
				END
			`),
			"ASC",
		],
		["last_name", "ASC"],
		["first_name", "ASC"],
		["id", "ASC"],
	];
}

function getSavedOrder(netids: string[]): Order {
	const sequelize = PersonModel.sequelize;
	if(!sequelize) throw new Error("Person model must be initialized before searching");
	const positions = netids.map(netid => sequelize.escape(netid)).join(", ");
	return [
		[Sequelize.literal(`array_position(ARRAY[${positions}]::varchar[], netid)`), "ASC"],
		["id", "ASC"],
	];
}

function getInitialsOrder(): OrderItem[] {
	return [
		["last_name", "ASC"],
		["first_name", "ASC"],
		["id", "ASC"],
	];
}

function getFilterValues(filters: Record<string, unknown>, field: string): string[] {
	const value = filters[field];
	if(value == null) return [];
	return (Array.isArray(value) ? value : [value])
		.map((v) => String(v))
		.filter(Boolean);
}

function andWhere(where: WhereOptions<PersonModel>, condition: WhereOptions<PersonModel>): WhereOptions<PersonModel> {
	if(Reflect.ownKeys(where).length === 0) return condition;
	return { [Op.and]: [where, condition] };
}

function buildBirthdayWhere(values: string[]): WhereOptions<PersonModel> | null {
	const maxDays = Math.max(...values.map(value => BIRTHDAY_FILTER_DAYS[value] ?? -1));
	if(maxDays < 0) return null;

	const dates = new Map<string, { birth_month: number; birth_day: number }>();
	for(let offset = 0; offset <= maxDays; offset++) {
		const date = new Date();
		date.setDate(date.getDate() + offset);
		const birthday = {
			birth_month: date.getMonth() + 1,
			birth_day: date.getDate(),
		};
		dates.set(`${birthday.birth_month}-${birthday.birth_day}`, birthday);
	}

	return {
		[Op.or]: [...dates.values()],
	};
}

// Values are "M" for a whole month or "M-D" for an exact date; any match counts
function buildBirthDateWhere(values: string[]): WhereOptions<PersonModel> | null {
	const conditions = values.flatMap((value) => {
		const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(value);
		if(!match) return [];
		const month = Number(match[1]);
		const day = match[2] ? Number(match[2]) : null;
		if(month < 1 || month > 12) return [];
		if(day === null) return [{ birth_month: month }];
		if(day < 1 || day > 31) return [];
		return [{ birth_month: month, birth_day: day }];
	});
	if(conditions.length === 0) return null;

	return {
		[Op.or]: conditions,
	};
}

function pruneCache() {
	if (searchCache.size <= SEARCH_CACHE_MAX) return;

	const entries = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
	const toRemove = entries.slice(0, entries.length - SEARCH_CACHE_MAX);
	for (const [key] of toRemove) {
		searchCache.delete(key);
	}
}

export default class PeopleRouter {
	getRouter = () => {
		const router = express.Router();
		router.post("/", CAS.requireAuthentication, this.getPeople);
		router.get("/suggest", CAS.requireAuthentication, this.getSuggestions);
		return router;
	};

	constructInitialsQuery = (initials: string) => {
		return buildInitialsSearch(initials);
	};

	buildNameSearchWhere = (query: string): WhereOptions<PersonModel> => {
		const terms = query.trim().split(/\s+/).filter(Boolean);
		return {
			[Op.and]: terms.map((term) => ({
				[Op.or]: [
					{ first_name: { [Op.iLike]: `%${term}%` } },
					{ preferred_name: { [Op.iLike]: `%${term}%` } },
					{ last_name: { [Op.iLike]: `%${term}%` } },
					{ email: { [Op.iLike]: `%${term}%` } },
					{ major: { [Op.iLike]: `%${term}%` } },
					{ organization: { [Op.iLike]: `%${term}%` } },
					Sequelize.where(
						Sequelize.fn("first_last_name", Sequelize.col("first_name"), Sequelize.col("last_name")),
						{ [Op.iLike]: `%${term}%` },
					),
				],
			})),
		};
	};

	getSearchViewer = async (netid?: string): Promise<SearchPerson | null> => netid
		? await PersonModel.findOne({ where: { netid }, attributes: ["year", "college"], raw: true })
		: null;

	getSuggestionsFromDatabase = async (query: string, limit: number = 8, netid?: string) => {
		try {
			const viewer = await this.getSearchViewer(netid);
			const people = await PersonModel.findAll({
				where: this.buildNameSearchWhere(query),
				attributes: ["netid", "first_name", "last_name", "image", "college", "year", "school"],
				order: [...searchProximity(viewer).sqlOrder(PersonModel.sequelize!), ...getSearchOrder(query)],
				limit,
			});
			return people.map((p) => ({
				netid: p.netid,
				first_name: p.first_name,
				last_name: p.last_name,
				image: p.image,
				college: p.college,
				year: p.year,
				school: p.school,
			}));
		} catch (e) {
			console.error("Error fetching suggestions from database:", e);
			return [];
		}
	};

	getSuggestions = async (req: Request, res: Response) => {
		const query = (req.query.q as string || "").trim();
		if (query.length < 2) {
			res.status(200).json([]);
			return;
		}

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

		const suggestions = await this.getSuggestionsFromDatabase(query, 8, req.netid);
		res.status(200).json(suggestions);
	};

	getPeople = async (req: Request, res: Response) => {
		if (req.body.query != null && (typeof req.body.query !== "string" || req.body.query.length > 200)) {
			res.status(400).send("Search query must be a string of at most 200 characters");
			return;
		}
		const query = (req.body.query || "").trim();
		const searchMode: SearchMode = isSearchMode(req.body.searchMode) ? req.body.searchMode : "default";
		const filtersRaw = req.body.filters || {};
		let excludedFilters: ExcludedFilters;
		try {
			excludedFilters = parseExcludedFilters(req.body.exclude_filters);
		} catch(error) {
			res.status(400).send(error instanceof Error ? error.message : "Invalid excluded filters");
			return;
		}
		const page = req.body.page || 0;
		const pageSize = req.body.page_size || 100;
		const randomSeed = getRandomSeed(req.body.random_seed);

		if(pageSize > 100 || pageSize < 1) {
			res.status(400).send("Page size must be between 1 and 100");
			return;
		}

		// Private saves are available only to the login session, not directory API keys.
		const savedOwnerNetid = !req.headers.authorization && req.isAuthenticated() ? req.netid : undefined;
		const cacheKey = getCacheKey(req.netid, `${searchMode}:${query}`, filtersRaw, excludedFilters, page, pageSize, randomSeed, savedOwnerNetid);
		const cached = searchCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
			// Profile preferences must stay fresh across every viewer's cached searches.
			const netids = cached.data.flatMap(person => person.netid ? [person.netid] : []);
			const profiles = netids.length
				? await UserProfileModel.findAll({ where: { netid: { [Op.in]: netids } } }) : [];
			const profileMap = new Map(profiles.map(profile => [profile.netid, profile.toSanitizedObject()]));
			const people = cached.data.map(person => ({
				...person,
				user_profile: person.netid ? profileMap.get(person.netid) : undefined,
			}));
			return res.status(200).json(await withYaleMojiAvatars(people));
		}

		let where: WhereOptions<PersonModel> = {};
		for(const field of Object.keys(filtersRaw)) {
			if(SYNTHETIC_FILTER_FIELDS.has(field as SyntheticFilterField)) continue;
			if(!(PERSON_ALLOWED_FILTER_FIELDS as readonly string[]).includes(field)) {
				res.status(400).send(`Cannot filter by field ${field}`);
				return;
			}

			if(field === "address_country" || field === "address_state") continue;
			if(field === "year") {
				const years = getFilterValues(filtersRaw, field)
					.map((value) => Number(value))
					.filter((value) => Number.isInteger(value));
				if(years.length === 0) {
					res.status(400).send("Year filters must be integers");
					return;
				}
				where = {
					...where,
					year: { [Op.in]: years },
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
		where = andWhere(where, buildLocationIncludesWhere(filtersRaw));
		where = andWhere(where, buildExcludedFiltersWhere(excludedFilters));

		let searchOrder: OrderItem[] | null = null;

		if(query) {
			if(searchMode === "first_name") {
				where = andWhere(where, {
					[Op.or]: [
						{ first_name: { [Op.iLike]: `%${query}%` } },
						{ preferred_name: { [Op.iLike]: `%${query}%` } },
					],
				});
				searchOrder = getSearchOrder(query);
			} else if(searchMode === "last_name") {
				where = andWhere(where, {
					last_name: { [Op.iLike]: `%${query}%` },
				});
				searchOrder = getSearchOrder(query);
			} else if(searchMode === "initials") {
				const initials = normalizeInitials(query);
				if(initials) {
					where = andWhere(where, this.constructInitialsQuery(initials));
					searchOrder = getInitialsOrder();
				} else {
					res.status(200).json([]);
					return;
				}

			} else if(searchMode === "full_name") {
				// Resolve progressive matching below, once ALL filters are applied.
			} else if(searchMode === "default" && query.match(/^[a-z]{2}$/i)) {
				where = andWhere(where, this.constructInitialsQuery(query));
				searchOrder = getInitialsOrder();
			} else {
				where = andWhere(where, this.buildNameSearchWhere(query));
				searchOrder = getSearchOrder(query);
			}
		}

		const birthdayWhere = buildBirthdayWhere(getFilterValues(filtersRaw, "birthday"));
		if(birthdayWhere) {
			where = andWhere(where, birthdayWhere);
		}

		const birthDateWhere = buildBirthDateWhere(getFilterValues(filtersRaw, "birth_date"));
		if(birthDateWhere) {
			where = andWhere(where, birthDateWhere);
		}
		const isBirthdaySearch = Boolean(birthdayWhere || birthDateWhere
			|| getFilterValues(filtersRaw, "birth_month").length || getFilterValues(filtersRaw, "birth_day").length);

		const savedListIds = getFilterValues(filtersRaw, "saved_list")
			.map(value => SavedListModel.parseId(value))
			.filter((value): value is number => value !== null);
		let savedOrder: string[] | null = null;
		if(getFilterValues(filtersRaw, "is_saved").includes("true") || getFilterValues(filtersRaw, "saved_list").length > 0) {
			if(!savedOwnerNetid) {
				res.status(200).json([]);
				return;
			}
			const savedNetids = getFilterValues(filtersRaw, "saved_list").length > 0
				? await SavedListMemberModel.getNetids(savedOwnerNetid, savedListIds)
				: await SavedContactModel.getSavedNetids(savedOwnerNetid);
			if(savedNetids.length === 0) {
				res.status(200).json([]);
				return;
			}
			where = andWhere(where, { netid: { [Op.in]: savedNetids } });
			savedOrder = savedNetids;
		}

		let people: PersonModel[];
		try {
			let offset = page * pageSize;
			const viewer = query || isBirthdaySearch ? await this.getSearchViewer(req.netid) : null;
			if(query && searchMode === "full_name") {
				const ids = await findNameSearchIds(PersonModel.sequelize!, query, async (condition, attributes) =>
					await PersonModel.findAll({
						where: andWhere(where, condition), attributes, raw: true,
					}) as unknown as NameSearchCandidate[],
					viewer,
				);
				const pageIds = ids.slice(offset, offset + Number(pageSize));
				where = andWhere(where, { id: { [Op.in]: pageIds } });
				searchOrder = pageIds.length ? [[Sequelize.fn("array_position",
					Sequelize.literal(`ARRAY[${pageIds.map(id => PersonModel.sequelize!.escape(id)).join(",")}]::integer[]`),
					Sequelize.col("id")), "ASC"]] : getInitialsOrder();
				offset = 0;
			} else if(query || isBirthdaySearch) {
				searchOrder = [...searchProximity(viewer).sqlOrder(PersonModel.sequelize!), ...(searchOrder ?? getInitialsOrder())];
			}
			people = await PersonModel.findAll({
				where,
				order: searchOrder ?? (savedOrder ? getSavedOrder(savedOrder) : getPeopleOrder(randomSeed)),
				limit: pageSize,
				offset,
			});
		} catch(e) {
			console.error(e);
			res.status(500).send("Error fetching people");
			return;
		}

		const netids = people.map(p => p.netid).filter(Boolean);
		const currentUserNetid = req.netid;

		const [profiles, allLikes, myLikes, mySaved, myListIds] = await Promise.all([
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
			savedOwnerNetid && netids.length > 0
				? SavedContactModel.findAll({
					where: { owner_netid: savedOwnerNetid, saved_netid: { [Op.in]: netids } },
				  })
				: [],
			savedOwnerNetid
				? SavedListMemberModel.getListIds(savedOwnerNetid, netids)
				: new Map<string, number[]>(),
		]);

		const profileMap = new Map(profiles.map(p => [p.netid, p.toSanitizedObject()]));

		const likeCountMap = new Map<string, number>();
		for (const row of allLikes) {
			likeCountMap.set(row.get("liked_netid") as string, parseInt(row.get("count") as string));
		}
		const myLikeSet = new Set(myLikes.map(l => l.liked_netid));

		const savedMap = new Map(mySaved.map(s => [s.saved_netid, s.note]));

		const json = people.map((person) => {
			const sanitized = person.toSanitizedObject();
			const profile = person.netid ? profileMap.get(person.netid) : undefined;
			const likeData = person.netid ? {
				like_count: likeCountMap.get(person.netid) || 0,
				liked_by_me: myLikeSet.has(person.netid),
			} : undefined;
			const savedData = savedOwnerNetid && person.netid
				? {
					saved: savedMap.has(person.netid),
					note: savedMap.get(person.netid) ?? null,
					list_ids: myListIds.get(person.netid) ?? [],
				}
				: undefined;
			return {
				...sanitized,
				...(profile && { user_profile: profile }),
				...(likeData && { like_data: likeData }),
				...(savedData && { saved_data: savedData }),
			};
		});

		if(query) {
			// Legacy two-letter queries use initials even without an explicit mode.
			const recordedSearchMode = searchMode === "default" && /^[a-z]{2}$/i.test(query) ? "initials" : searchMode;
			try {
				await PersonModel.sequelize!.query(`
					INSERT INTO recents (netid, name, query, search_mode, results)
					VALUES (CAST($netid AS TEXT), (SELECT concat_ws(' ', first_name, last_name) FROM person
						WHERE LOWER(netid) = LOWER($netid) LIMIT 1), $query, $searchMode, CAST($results AS TEXT[]))
				`, { bind: { netid: req.netid, query, searchMode: recordedSearchMode, results: netids } });
			} catch {
				console.error("Failed to save recent search");
			}
		}

		searchCache.set(cacheKey, { data: json, timestamp: Date.now() });
		pruneCache();

		res.status(200).json(await withYaleMojiAvatars(json));
	};
};
