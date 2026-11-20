import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Sequelize, QueryTypes, Op } from "sequelize";
import { findNameSearchIds, buildInitialsSearch, normalizeInitials, NAME_SEARCH_SETUP_SQL, scoreName, scoreNameWord, keyboardDistance } from "../build/helpers/nameSearch.js";
import PeopleRouter from "../build/helpers/routes/peopleRouter.js";
import PersonModel from "../build/helpers/models/PersonModel.js";
import UserProfileModel from "../build/helpers/models/UserProfileModel.js";
import ProfileLikeModel from "../build/helpers/models/ProfileLikeModel.js";
import SavedRouter from "../build/helpers/routes/savedRouter.js";
import SavedListRouter from "../build/helpers/routes/savedListRouter.js";
import SavedListDefaultModel from "../build/helpers/models/SavedListDefaultModel.js";
import SavedContactModel from "../build/helpers/models/SavedContactModel.js";
import SavedListModel from "../build/helpers/models/SavedListModel.js";
import SavedListMemberModel from "../build/helpers/models/SavedListMemberModel.js";
import { RECENTS_SETUP_SQL } from "../build/helpers/db.js";
import { getImportCandidates, resolveImport } from "../build/helpers/savedListImport.js";

// Use a disposable Postgres database. Fixtures live in a rolled-back temporary
// table and an isolated schema dropped at cleanup. Search functions/extensions remain.
if (!process.env.SEARCH_TEST_DATABASE_URL) throw new Error("Set SEARCH_TEST_DATABASE_URL to a disposable PostgreSQL database");
const sql = new Sequelize(process.env.SEARCH_TEST_DATABASE_URL, { logging: false });
const schema = `name_search_${randomBytes(8).toString("hex")}`;
const routerSql = new Sequelize(process.env.SEARCH_TEST_DATABASE_URL, {
	logging: false, dialectOptions: { options: `-c search_path=${schema},public` },
});
const router = new PeopleRouter();
let transaction;
before(async () => {
	await sql.query(NAME_SEARCH_SETUP_SQL);
	transaction = await sql.transaction();
	await sql.query(`CREATE TEMP TABLE search_fixture (
		id integer, first_name text, preferred_name text, last_name text, major text
	) ON COMMIT DROP`, { transaction });
	await sql.query(`INSERT INTO search_fixture VALUES
		(1, 'John', NULL, 'Smith', 'History'),
		(2, 'Joan', NULL, 'Smith', 'Math'),
		(3, 'Jordan', NULL, 'Stone', 'English'),
		(4, 'Kathryn', NULL, 'Brown', 'History'),
		(5, 'Elizabeth', 'Liz', 'Jones', 'Computer Science'),
		(6, 'Al', NULL, 'Ng', 'History'),
		(7, 'Ben', NULL, 'Lake', 'History'),
		(8, 'Ben', NULL, 'Ocean', 'Math'),
		(9, 'Benjamin', NULL, 'Waterfall', 'History'),
		(10, 'Bennett', NULL, 'Longsurname', 'History'),
		(11, 'Bex', NULL, 'Lake', 'History'),
		(12, 'Ànabele', NULL, 'García', 'History'),
		(13, 'Jennifer', NULL, 'Liu', 'History'),
		(14, 'Jennifer', NULL, 'Stone', 'History'),
		(15, 'Hannah', NULL, 'Liu', 'Math'),
		(16, 'Jenifer', NULL, 'Lou', 'History'),
		(17, 'Stephen', NULL, 'Wright', 'History'),
		(18, 'Steven', NULL, 'Right', 'History'),
		(19, 'Shawn', NULL, 'Wong', 'History'),
		(20, 'Catharine', NULL, 'Brown', 'History'),
		(21, 'John', NULL, 'Johnson', 'History'),
		(22, 'Jean-Luc', NULL, 'O’Connor', 'History'),
		(23, 'José', NULL, 'Núñez', 'History'),
		(24, 'Zoë', NULL, 'Lee', 'History'),
		(25, 'Søren', NULL, 'Møller', 'History'),
		(26, 'İpek', NULL, 'Yılmaz', 'History'),
		(27, 'Łukasz', NULL, 'Żółć', 'History'),
		(28, 'Anna Marie', NULL, 'van der Meer', 'History'),
		(29, '李', NULL, '王', 'History'),
		(30, 'Alex', NULL, 'Zulu', 'History'),
		(31, 'Rodrigo', NULL, 'Albuquerque', 'History'),
		(32, 'Robin', NULL, 'Al', 'History'),
		(33, 'Elizabeth', 'Ally', 'Adams', 'History'),
		(34, 'Mary Alice', NULL, 'Baker', 'History'),
		(35, 'Álvaro', NULL, 'Zephyr', 'History'),
		(36, 'Mary Alex', NULL, 'Zebra', 'History')`, { transaction });
	await sql.query(`CREATE SCHEMA ${schema}`);
	for (const Model of [PersonModel, UserProfileModel, ProfileLikeModel, SavedContactModel, SavedListModel, SavedListMemberModel, SavedListDefaultModel]) {
		Model.initModel(routerSql);
		await Model.sync();
	}
	await routerSql.query("CREATE FUNCTION first_last_name(text, text) RETURNS text LANGUAGE SQL IMMUTABLE AS $$ SELECT concat_ws(' ', $1, $2) $$");
	await routerSql.query("CREATE TABLE recents (netid text, name text, query text)");
	await routerSql.query("INSERT INTO recents VALUES ('historical', 'Historical user', 'HL')");
	await routerSql.query(RECENTS_SETUP_SQL);
	await routerSql.query(RECENTS_SETUP_SQL); // Repeated startup must preserve old rows.
	await PersonModel.bulkCreate([
		{ id: 1, netid: "ben1", first_name: "Ben", last_name: "Ocean", image: null },
		{ id: 2, netid: "ben2", first_name: "Ben", last_name: "Lake", image: "test" },
		{ id: 3, netid: "ben3", first_name: "Bex", last_name: "Lake", image: "test" },
		{ id: 4, netid: "jl1", first_name: "Jennifer", last_name: "Liu", major: "History" },
		{ id: 5, netid: "jl2", first_name: "Jennifer", last_name: "Stone", major: "Math" },
		{ id: 6, netid: "hl1", first_name: "Hannah", last_name: "Liu", major: "Math" },
		{ id: 7, netid: "ana1", first_name: "Ànabele", last_name: "García" },
		{ id: 8, netid: "al1", first_name: "Alex", last_name: "Zulu" },
		{ id: 9, netid: "al2", first_name: "Robin", last_name: "Al" },
		{ id: 10, netid: "al3", first_name: "Elizabeth", preferred_name: "Ally", last_name: "Adams" },
		{ id: 11, netid: "al4", first_name: "Rodrigo", last_name: "Albuquerque" },
		{ id: 12, netid: "al5", first_name: "Álvaro", last_name: "Zephyr" },
		{ id: 13, netid: "al6", first_name: "Mary Alice", last_name: "Baker" },
		{ id: 90, netid: "rank-viewer", first_name: "Viewer", last_name: "Account", year: 2029, college: "Branford College" },
		{ id: 91, netid: "rank91", first_name: "Proximity", last_name: "ResultZulu", year: 2029, college: "Branford College" },
		{ id: 92, netid: "rank92", first_name: "Proximity", last_name: "ResultYankee", year: 2029, college: "Saybrook College" },
		{ id: 93, netid: "rank93", first_name: "Proximity", last_name: "ResultXray", year: 2029, college: "Davenport College" },
		{ id: 94, netid: "rank94", first_name: "Proximity", last_name: "ResultAlpha", year: 2029, college: "Pierson College" },
		{ id: 95, netid: "rank95", first_name: "Proximity", last_name: "ResultVictor", year: 2030, college: "Branford College" },
		{ id: 96, netid: "rank96", first_name: "Proximity", last_name: "ResultUniform", year: 2028, college: "Branford College" },
		{ id: 97, netid: "rank97", first_name: "Proximity", last_name: "ResultTango", year: 2027, college: "Branford College" },
		{ id: 98, netid: "rank98", first_name: "Proximity", last_name: "ResultSierra", college: "Branford College" },
		{ id: 99, netid: "rank99", first_name: "ProximityExtended", last_name: "ResultZulu", year: 2029, college: "Benjamin Franklin College" },
		{ id: 100, netid: "tie-viewer", first_name: "Viewer", last_name: "Account", year: 2029, college: "Trumbull College" },
	]);
	const today = new Date();
	await PersonModel.update({ birth_month: today.getMonth() + 1, birth_day: today.getDate(), school: "Yale College" },
		{ where: { id: { [Op.between]: [91, 99] } } });
	await UserProfileModel.create({ netid: "ben1", description: "A fixture profile" });
	await ProfileLikeModel.create({ liker_netid: "viewer", liked_netid: "ben1" });
	await SavedContactModel.create({ owner_netid: "viewer", saved_netid: "hl1", note: "Private fixture" });
	const list = await SavedListModel.create({ owner_netid: "viewer", name: "Study group" });
	await SavedListMemberModel.create({ list_id: list.id, owner_netid: "viewer", saved_netid: "hl1" });
});
after(async () => {
	await transaction?.rollback();
	await routerSql.close();
	await sql.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
	await sql.close();
});

async function matches(query, included = null, options = {}) {
	return findNameSearchIds(sql, query, async (condition, attributes) => {
		options.calls?.push(condition.val);
		const where = { [Op.and]: [condition, included ? { id: { [Op.in]: included } } : {}, options.where ?? {}] };
		const statement = sql.getQueryInterface().queryGenerator.selectQuery("search_fixture", { attributes, where });
		return sql.query(statement, { transaction, type: QueryTypes.SELECT });
	});
}

test("name search tolerates transposed letters", async () => {
	assert.ok((await matches("Jhon Smith")).includes(1));
	assert.ok((await matches("Kathyrn Brown")).includes(4));
});
test("name search tolerates a missing letter", async () => {
	assert.ok((await matches("Kathrn Brown")).includes(4));
});
test("preferred names and reversed name order match", async () => {
	assert.deepEqual(await matches("Liz Jones"), [5]);
	assert.ok((await matches("Smith John")).includes(1));
});
test("short name queries remain literal, and names exclude other fields", async () => {
	assert.deepEqual(await matches("Al", [1, 2, 3, 4, 5, 6]), [6]);
	assert.deepEqual(await matches("JS"), []);
	assert.deepEqual(await matches("Computer Science"), []);
});

const words = text => text.split(" ").map(text => ({ text, phonetics: [] }));
const candidate = (first, last, preferred = "") => ({
	id: 1, first_words: words(first), last_words: words(last), preferred_words: preferred ? words(preferred) : [],
});

test("query coverage does not reward shorter surnames or name completions", async () => {
	assert.deepEqual(scoreName(words("ben"), candidate("ben", "lake")), scoreName(words("ben"), candidate("ben", "ocean")));
	assert.deepEqual(scoreName(words("ben"), candidate("benjamin", "waterfall")), scoreName(words("ben"), candidate("bennett", "longsurname")));
	assert.deepEqual(await matches("ben", [7, 8, 9, 10, 11]), [7, 8, 10, 9]);
});

test("single-word queries put given-name beginnings before surname and interior-word matches", async () => {
	const included = [6, 30, 31, 32, 33, 34, 35, 36];
	for (const query of ["al", " AL ", "ál"]) {
		assert.deepEqual(await matches(query, included), [6, 33, 35, 30, 32, 31, 34, 36]);
	}
	// Full-name queries retain their existing score and alphabetical tie breakers.
	assert.deepEqual(await matches("al z", [30, 36]), [36, 30]);
});

test("literal results stop broadening even if there is only one", async () => {
	const calls = [];
	assert.deepEqual(await matches("ben lake", [7, 8, 11], { calls }), [7]);
	assert.equal(calls.length, 1);
	assert.deepEqual(await matches("stephen wright", [17, 18]), [17]);
});

test("QWERTY neighbors and transpositions cost less than distant substitutions", async () => {
	assert.ok(keyboardDistance("jennifwr", "jennifer").cost < keyboardDistance("jennifzr", "jennifer").cost);
	assert.equal(keyboardDistance("jhon", "john").cost, 0.5);
	assert.equal(keyboardDistance("kathrn", "kathryn").cost, 0.8);
	assert.deepEqual(await matches("jennifwr liu", [13, 14, 16]), [13]);
	assert.ok(scoreNameWord(words("jennifwr")[0], words("jennifer")[0]).score > scoreNameWord(words("jennifzr")[0], words("jennifer")[0]).score);
});

test("phonetic spelling differences are recovered after literal and close typo matching", async () => {
	for (const [query, id] of [["steven wright", 17], ["sean wong", 19], ["shaun wong", 19], ["katherine brown", 20]]) {
		const calls = [];
		assert.deepEqual(await matches(query, [id], { calls }), [id]);
		assert.equal(calls.length, 2, `${query} must match the full name, without independent word fallback`);
	}
	assert.equal(scoreNameWord({ text: "alexander", phonetics: ["ALKS"] }, { text: "alcohol", phonetics: ["ALKS"] }), null);
});

test("accents, combining marks, and ligatures fold in both queries and names", async () => {
	for (const [query, id] of [
		["ana", 12], ["ÀNA", 12], ["a\u0300na", 12], ["jose nunez", 23], ["josé núñez", 23],
		["zoe", 24], ["soren moller", 25], ["ipek yilmaz", 26], ["lukasz zolc", 27], ["李 王", 29],
	]) assert.deepEqual(await matches(query, [id]), [id], query);
});

test("compound names, apostrophes, preferred names, and reversed order work", async () => {
	for (const query of ["jean luc oconnor", "O'Connor Jean-Luc", "jean o’connor"]) {
		assert.deepEqual(await matches(query, [22]), [22]);
	}
	assert.deepEqual(await matches("van der meer anna marie", [28]), [28]);
	assert.deepEqual(await matches("jones liz", [5]), [5]);
});

test("full names use distinct words and do not mix legal and preferred names", async () => {
	assert.equal(scoreName(words("john john"), candidate("john", "smith")), null);
	assert.equal(scoreName(words("elizabeth liz"), candidate("elizabeth", "jones", "liz")), null);
	assert.equal(scoreName(words("john johnson"), candidate("john", "johnson")).score, 1);
	assert.equal(scoreName(words("johnson john"), candidate("john", "johnson")).score, 1);
	assert.deepEqual(await matches("john johnson", [1, 21]), [21]);
});

test("full-name fuzzy matching precedes the independent word fallback", async () => {
	const calls = [];
	assert.deepEqual(await matches("jennifr liu", [13, 14, 15], { calls }), [13]);
	assert.equal(calls.length, 2);
	assert.deepEqual(await matches("jennifer liu", [14, 15]), [15, 14]);
	assert.deepEqual(await matches("jennifr liu", [14, 15]), [15, 14]);
	assert.deepEqual(await matches("jennifer qzxwv", [14, 15]), [14]);
});

test("filters apply before deciding whether full-name matching has succeeded", async () => {
	assert.deepEqual(await matches("jennifer liu", [13, 14, 15], { where: { major: "Math" } }), [15]);
	assert.deepEqual(await matches("jhon smith", [1, 2], { where: { major: "Math" } }), [2]);
});

test("independent word fallback deduplicates people", async () => {
	assert.deepEqual(await matches("ben ben", [7, 8]), [7, 8]);
});

async function people(body, netid = "viewer", apiKey = false) {
	let status = 200;
	let result;
	const response = {
		status(code) { status = code; return this; },
		json(value) { result = value; return this; },
		send(value) { result = value; return this; },
	};
	await router.getPeople({
		body: { searchMode: "full_name", ...body }, netid,
		headers: apiKey ? { authorization: "Bearer test" } : {},
		isAuthenticated: () => true,
	}, response);
	assert.equal(status, 200, JSON.stringify(result));
	return result;
}

test("recents records the actual search mode without guessing historical modes", async () => {
	const netid = "mode-test";
	for (const searchMode of ["full_name", "initials", "default", "first_name", "last_name"]) {
		await people({ query: "HL", searchMode }, netid);
	}
	const rows = await routerSql.query("SELECT search_mode FROM recents WHERE netid = $netid", {
		bind: { netid }, type: QueryTypes.SELECT,
	});
	assert.deepEqual(rows.map(row => row.search_mode).sort(), ["first_name", "full_name", "initials", "initials", "last_name"]);
	const [historical] = await routerSql.query("SELECT query, search_mode, results FROM recents WHERE netid = 'historical'", { type: QueryTypes.SELECT });
	assert.deepEqual(historical, { query: "HL", search_mode: null, results: null });
	await people({ query: "HL", searchMode: "initials" }, netid);
	const [count] = await routerSql.query("SELECT count(*)::int AS count FROM recents WHERE netid = $netid", { bind: { netid }, type: QueryTypes.SELECT });
	assert.equal(count.count, 5, "logging still respects the existing response cache");
});

test("recents stores the returned NetIDs in each viewer's personalized order", async () => {
	for (const [netid, expected] of [["rank-viewer", ["rank91", "rank92"]], ["rank95", ["rank95", "rank91"]]]) {
		const body = { query: "proximity", page_size: 2 };
		const results = await people(body, netid);
		assert.deepEqual(results.map(person => person.netid), expected);
		await people(body, netid); // Cache hits must not append another entry.
		const rows = await routerSql.query("SELECT results FROM recents WHERE netid = $netid AND query = 'proximity'", {
			bind: { netid }, type: QueryTypes.SELECT,
		});
		assert.deepEqual(rows, [{ results: expected }]);
	}
	const page = await people({ query: "proximity", page_size: 2, page: 1 }, "rank95");
	assert.deepEqual(page.map(person => person.netid), ["rank92", "rank93"]);
	const [pageLog] = await routerSql.query("SELECT results FROM recents WHERE netid = 'rank95' AND results = ARRAY['rank92', 'rank93']::text[]", {
		type: QueryTypes.SELECT,
	});
	assert.deepEqual(pageLog.results, page.map(person => person.netid));
	assert.deepEqual(await people({ query: "qzxwvp" }, "rank-viewer"), []);
	const [empty] = await routerSql.query("SELECT results FROM recents WHERE netid = 'rank-viewer' AND query = 'qzxwvp'", { type: QueryTypes.SELECT });
	assert.deepEqual(empty.results, []);
});

test("people route preserves relevance, pagination, and per-user profile data", async () => {
	assert.deepEqual((await people({ query: "ben", page_size: 1, page: 0 })).map(person => person.id), [2]);
	const second = await people({ query: "ben", page_size: 1, page: 1 });
	assert.deepEqual(second.map(person => person.id), [1]);
	assert.equal(second[0].user_profile.description, "A fixture profile");
	assert.equal(second[0].like_data.liked_by_me, true);
	assert.equal((await people({ query: "ben", page_size: 1, page: 1 }, "another"))[0].like_data.liked_by_me, false);
	assert.deepEqual(await people({ query: "ben", page_size: 1, page: 2 }), []);
	assert.deepEqual((await people({ query: "ana" })).map(person => person.id), [7]);
});

test("people route paginates given-name prefixes before retaining surname matches", async () => {
	const pages = [];
	for (let page = 0; page < 4; page++) {
		pages.push((await people({ query: "al", page_size: 2, page })).map(person => person.id));
	}
	assert.deepEqual(pages, [[10, 12], [8, 9], [11, 13], []]);
});

test("personalized ordering covers the entire match set before pagination in every search mode", async () => {
	const expected = [91, 92, 93, 94, 99, 95, 96, 97, 98];
	for (const [searchMode, query] of [["full_name", "proximity"], ["full_name", "proximity absentword"],
		["initials", "PR"], ["default", "proximity"], ["first_name", "proximity"], ["last_name", "Result"]]) {
		const pages = [];
		for (let page = 0; page < 4; page++) {
			pages.push(...(await people({ searchMode, query, page, page_size: 3 }, "rank-viewer")).map(person => person.id));
		}
		assert.deepEqual(pages, expected, `${searchMode}: ${query}`);
	}
	// Same query, different searcher: ties by college name outrank name closeness.
	const forTrumbull = await people({ query: "proximity" }, "tie-viewer");
	assert.ok(forTrumbull.findIndex(p => p.id === 99) < forTrumbull.findIndex(p => p.id === 94));
	const suggestions = await router.getSuggestionsFromDatabase("proximity", 3, "rank-viewer");
	assert.deepEqual(suggestions.map(p => p.netid), ["rank91", "rank92", "rank93"]);
});

test("birthday results use personal year and college proximity before pagination without a query", async () => {
	const today = new Date();
	const month = today.getMonth() + 1;
	const day = today.getDate();
	for (const filters of [
		{ school: "Yale College", birth_month: month, birth_day: day }, // Homepage birthdays.
		{ birthday: ["today"] },
		{ birth_date: [`${month}-${day}`] },
		{ birth_date: [String(month)] },
	]) {
		const ids = [];
		for (let page = 0; page < 4; page++) {
			ids.push(...(await people({ filters, page, page_size: 3 }, "rank-viewer")).map(p => p.id));
		}
		assert.deepEqual(ids, [91, 92, 93, 94, 99, 95, 96, 97, 98], JSON.stringify(filters));
	}
	const otherViewer = await people({ filters: { birthday: ["today"] } }, "rank95");
	assert.deepEqual(otherViewer.map(p => p.id), [95, 91, 92, 93, 94, 99, 96, 97, 98]);
});

test("people route falls back within inclusion, exclusion, and saved-contact filters", async () => {
	assert.deepEqual((await people({ query: "jennifer liu" })).map(person => person.id), [4]);
	assert.deepEqual((await people({ query: "jennifer liu", filters: { major: ["Math"] } })).map(person => person.id), [6, 5]);
	assert.deepEqual((await people({ query: "jennifer liu", exclude_filters: { major: ["History"] } })).map(person => person.id), [6, 5]);
	assert.deepEqual((await people({ query: "jennifer liu", filters: { is_saved: ["true"] } })).map(person => person.id), [6]);
	const [list] = await SavedListModel.getLists("viewer");
	assert.deepEqual((await people({ query: "jennifer liu", filters: { saved_list: [String(list.id)] } })).map(person => person.id), [6]);
	assert.deepEqual(await people({ filters: { saved_list: [String(list.id)] } }, "another"), []);
	const [saved] = await people({ filters: { is_saved: ["true"] } });
	assert.equal(saved.saved_data.note, "Private fixture");
	assert.equal((await people({ query: "HL", searchMode: "initials" }, "another"))[0].saved_data.note, null);
	assert.deepEqual((await people({ query: "HL", searchMode: "initials" })).map(person => person.id), [6]);
});

test("short queries remain literal and unrelated input stays empty", async () => {
	assert.deepEqual(await matches("xl", [6]), []);
	assert.deepEqual(await matches("qzxwvp"), []);
	for (const query of ["", " ", ".", "---", "\u0301", "a".repeat(201)]) assert.deepEqual(await matches(query), []);
});

test("generated deletion, transposition, and QWERTY typo corpus recovers the intended name", async () => {
	let checked = 0;
	const keyboard = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
	for (const [name, last, id] of [["jennifer", "liu", 13], ["kathryn", "brown", 4], ["elizabeth", "jones", 5]]) {
		const variants = new Set();
		for (let i = 0; i < name.length; i++) {
			variants.add(name.slice(0, i) + name.slice(i + 1));
			if (i + 1 < name.length) variants.add(name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2));
			const row = keyboard.find(row => row.includes(name[i]));
			const x = row.indexOf(name[i]);
			for (const neighbor of [row[x - 1], row[x + 1]].filter(Boolean)) variants.add(name.slice(0, i) + neighbor + name.slice(i + 1));
		}
		for (const variant of variants) {
			const calls = [];
			assert.deepEqual(await matches(`${variant} ${last}`, [id], { calls }), [id], `${variant} -> ${name}`);
			assert.ok(calls.length <= 2, `${variant} must match the full name, without independent word fallback`);
			checked++;
		}
	}
	assert.ok(checked >= 80);
});
test("SQL wildcard and quote input cannot broaden the search", async () => {
	assert.deepEqual(await matches("%"), []);
	assert.deepEqual(await matches("_"), []);
	assert.deepEqual(await matches("' OR 1=1 --"), []);
});
test("initials accept spacing and periods, but never fuzzy names", async () => {
	assert.equal(normalizeInitials(" j.s. "), "JS");
	assert.equal(normalizeInitials("J S"), "JS");
	for (const invalid of ["John", "J", "J3", "JSS", "%_"]) assert.equal(normalizeInitials(invalid), null);
	const generator = sql.getQueryInterface().queryGenerator;
	const query = generator.selectQuery("search_fixture", { attributes: ["id"], where: buildInitialsSearch("JS"), order: [["id", "ASC"]] });
	assert.deepEqual((await sql.query(query, { transaction, type: QueryTypes.SELECT })).map(row => row.id), [1, 2, 3, 14]);
});


async function savedAction(handler, netid, params = {}, body = {}, expectedStatus = 200) {
	let status = 200;
	let result;
	const response = {
		status(code) { status = code; return this; },
		json(value) { result = value; return this; },
		send(value) { result = value; return this; },
	};
	await handler({ netid, params, body }, response);
	assert.equal(status, expectedStatus, JSON.stringify(result));
	return result;
}

test("saving, list membership, and notes invalidate search without leaking another owner's data", async () => {
	const saved = new SavedRouter();
	const lists = new SavedListRouter();
	const owner = "save-test";
	const netid = "ben2";
	const body = { query: "ben", searchMode: "full_name" };
	assert.equal((await people(body, owner)).find(p => p.netid === netid).saved_data.saved, false);
	const { list } = await savedAction(lists.createList, owner, {}, { name: "Integration list" }, 201);
	await savedAction(saved.saveContact, "another", { netid }, { list_id: list.id }, 404);
	await savedAction(lists.renameList, "another", { id: list.id }, { name: "Stolen" }, 404);
	await savedAction(saved.saveContact, owner, { netid }, { list_id: list.id, note: "Only mine" });
	const person = (await people(body, owner)).find(p => p.netid === netid);
	assert.deepEqual(person.saved_data, { saved: true, note: "Only mine", list_ids: [list.id] });
	assert.equal((await people(body, owner, true)).find(p => p.netid === netid).saved_data, undefined);
	assert.deepEqual(await people({ filters: { is_saved: ["true"] } }, owner, true), []);
	assert.equal((await people(body, owner)).find(p => p.netid === netid).saved_data.note, "Only mine");
	assert.deepEqual((await people({ filters: { saved_list: [String(list.id)] } }, owner)).map(p => p.netid), [netid]);
	assert.equal((await people(body, "another")).find(p => p.netid === netid).saved_data.note, null);
	await savedAction(saved.updateNote, owner, { netid }, { note: "Updated" });
	assert.equal((await people(body, owner)).find(p => p.netid === netid).saved_data.note, "Updated");
	await savedAction(lists.removeMember, "another", { id: list.id, netid }, {}, 404);
	await savedAction(lists.removeMember, owner, { id: list.id, netid });
	assert.deepEqual(await people({ filters: { saved_list: [String(list.id)] } }, owner), []);
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid })).saved, false);
	await savedAction(saved.unsaveContact, owner, { netid });
	assert.equal((await people(body, owner)).find(p => p.netid === netid).saved_data.saved, false);
	await savedAction(lists.deleteList, owner, { id: list.id });
});

test("cached saved results distinguish exclusion filters and keep newest saves first", async () => {
	const owner = "saved-order-test";
	await SavedContactModel.bulkCreate([
		{ owner_netid: owner, saved_netid: "jl1", created_at: new Date("2026-01-01") },
		{ owner_netid: owner, saved_netid: "jl2", created_at: new Date("2026-01-02") },
	]);
	const filters = { is_saved: ["true"] };
	assert.deepEqual((await people({ filters }, owner)).map(p => p.netid), ["jl2", "jl1"]);
	assert.deepEqual((await people({ filters, exclude_filters: { major: ["Math"] } }, owner)).map(p => p.netid), ["jl1"]);
	assert.deepEqual((await people({ filters }, owner)).map(p => p.netid), ["jl2", "jl1"]);
});

test("duplicating a list copies its members, keeps notes, and makes an independent bounded name", async () => {
	const owner = "duplicate-test";
	const lists = new SavedListRouter();
	const saved = new SavedRouter();
	const { list } = await savedAction(lists.createList, owner, {}, { name: "A".repeat(50) }, 201);
	await savedAction(saved.saveContact, owner, { netid: "ben1" }, { list_id: list.id, note: "A shared private note" });
	await savedAction(saved.saveContact, owner, { netid: "ben2" }, { list_id: list.id });
	await savedAction(lists.duplicateList, "another", { id: list.id }, {}, 404);
	const { list: copy } = await savedAction(lists.duplicateList, owner, { id: list.id }, {}, 201);
	const { list: secondCopy } = await savedAction(lists.duplicateList, owner, { id: list.id }, {}, 201);
	assert.equal(copy.count, 2);
	assert.equal(copy.name.length, 50);
	assert.match(copy.name, / \(copy\)$/);
	assert.match(secondCopy.name, / \(copy 2\)$/);
	assert.equal(secondCopy.name.length, 50);
	assert.notEqual(copy.id, list.id);
	const members = await people({ filters: { saved_list: [String(copy.id)] } }, owner);
	assert.deepEqual(new Set(members.map(person => person.netid)), new Set(["ben1", "ben2"]));
	assert.equal(members.find(person => person.netid === "ben1").saved_data.note, "A shared private note");
	assert.equal(await SavedListDefaultModel.getDefault(owner), list.id);
	await savedAction(lists.removeMember, owner, { id: copy.id, netid: "ben1" });
	assert.equal((await people({ filters: { saved_list: [String(copy.id)] } }, owner)).length, 1);
	assert.equal((await people({ filters: { saved_list: [String(list.id)] } }, owner)).length, 2);
	await savedAction(lists.renameList, owner, { id: copy.id }, { name: "B".repeat(51) }, 400);
	await savedAction(lists.renameList, owner, { id: copy.id }, { name: "B".repeat(50) });
	await SavedListModel.bulkCreate(Array.from({ length: 47 }, (_, index) => ({ owner_netid: owner, name: `Limit ${index}` })));
	await savedAction(lists.duplicateList, owner, { id: list.id }, {}, 400);
});

test("an owner without lists gets one Friends list with existing saves and a working default", async () => {
	const owner = "friends-bootstrap-test";
	const lists = new SavedListRouter();
	const saved = new SavedRouter();
	await SavedContactModel.create({ owner_netid: owner, saved_netid: "ben1", note: "Keep this note" });
	const [first, second] = await Promise.all([
		savedAction(lists.getLists, owner), savedAction(lists.getLists, owner),
	]);
	assert.equal(first.lists.length, 1);
	assert.equal(second.lists.length, 1);
	assert.equal(first.lists[0].name, "Friends");
	assert.equal(first.lists[0].count, 1);
	assert.equal(first.default_list_id, second.default_list_id);
	const id = first.default_list_id;
	await savedAction(saved.saveContact, owner, { netid: "ben2" });
	assert.deepEqual((await savedAction(saved.getSavedContact, owner, { netid: "ben2" })).list_ids, [id]);
	await savedAction(lists.removeMember, owner, { id, netid: "ben1" });
	const afterRemoval = await savedAction(lists.getLists, owner);
	assert.equal(afterRemoval.lists[0].count, 1);
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid: "ben1" })).saved, false);
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid: "ben1" })).note, null);
	assert.deepEqual((await savedAction(saved.getSavedContact, owner, { netid: "ben1" })).list_ids, []);
	const { list: custom } = await savedAction(lists.createList, "custom-list-test", {}, { name: "Classmates" }, 201);
	const existing = await savedAction(lists.getLists, "custom-list-test");
	assert.deepEqual(existing.lists.map(list => list.name), ["Classmates"]);
	assert.equal(existing.default_list_id, custom.id);
});

test("import chooses one delimiter by unique exact matches without combining separators", () => {
	const directory = [
		{ netid: "ben1", email: "ben.one@yale.edu" },
		{ netid: "ben2", email: "ben.two@yale.edu" },
		{ netid: "jl1", email: null },
	];
	for(const [text, delimiter] of [
		["BEN1, ben.two@yale.edu,jl1", "commas"],
		["ben1  ben2\tjl1", "spaces"],
		["ben1\r\nben2\njl1", "newlines"],
	]) {
		const result = resolveImport(getImportCandidates(text), directory, "viewer");
		assert.equal(result.delimiter, delimiter);
		assert.deepEqual(result.netids, ["ben1", "ben2", "jl1"]);
	}
	const mixed = resolveImport(getImportCandidates("ben1,ben2,jl1\nmissing"), directory, "viewer");
	assert.equal(mixed.delimiter, "commas");
	assert.deepEqual(mixed.netids, ["ben1", "ben2"]);
	assert.deepEqual(mixed.unmatched, ["jl1\nmissing"]);
	assert.deepEqual(resolveImport(getImportCandidates("ben1,ben.one@yale.edu,BEN1"), directory, "viewer").netids, ["ben1"]);
	const ambiguous = resolveImport(getImportCandidates("same@yale.edu\nben1\nnot-real"), [
		...directory, { netid: "x1", email: "same@yale.edu" }, { netid: "x2", email: "same@yale.edu" },
	], "ben1");
	assert.deepEqual(ambiguous.ambiguous, ["same@yale.edu"]);
	assert.deepEqual(ambiguous.skipped_self, ["ben1"]);
	assert.deepEqual(ambiguous.unmatched, ["not-real"]);
	assert.throws(() => getImportCandidates(" "));
	assert.throws(() => getImportCandidates("x".repeat(50001)));
	assert.throws(() => getImportCandidates(Array.from({ length: 1001 }, (_, i) => `id${i}`).join(",")));
});

test("bulk import adds exact directory identities once and preserves private notes and other lists", async () => {
	const owner = "list-import-test";
	const lists = new SavedListRouter();
	await PersonModel.update({ email: "ben.one@yale.edu" }, { where: { netid: "ben1" } });
	await PersonModel.update({ email: "ben.two@yale.edu" }, { where: { netid: "ben2" } });
	const { list } = await savedAction(lists.createList, owner, {}, { name: "Imported people" }, 201);
	const { list: other } = await savedAction(lists.createList, owner, {}, { name: "Other list" }, 201);
	await savedAction(new SavedRouter().saveContact, owner, { netid: "ben1" }, { list_id: other.id, note: "Keep my private note" });
	const body = { text: "BEN.ONE@YALE.EDU,ben2,jl1,not-in-directory" };
	await savedAction(lists.importMembers, "another", { id: list.id }, body, 404);
	const result = await savedAction(lists.importMembers, owner, { id: list.id }, body);
	assert.equal(result.delimiter, "commas");
	assert.equal(result.matched, 3);
	assert.equal(result.added, 3);
	assert.deepEqual(result.unmatched, ["not-in-directory"]);
	const ben = result.saved.find(contact => contact.saved_netid === "ben1");
	assert.equal(ben.note, "Keep my private note");
	assert.deepEqual(new Set(ben.list_ids), new Set([list.id, other.id]));
	const repeated = await savedAction(lists.importMembers, owner, { id: list.id }, body);
	assert.equal(repeated.added, 0);
	assert.equal(repeated.already_in_list, 3);
	assert.equal(await SavedListMemberModel.count({ where: { list_id: list.id } }), 3);
	assert.equal(await SavedListDefaultModel.getDefault(owner), other.id);
	const noMatches = await savedAction(lists.importMembers, owner, { id: list.id }, { text: "Benny" });
	assert.equal(noMatches.matched, 0);
	assert.equal(await SavedListMemberModel.count({ where: { list_id: list.id } }), 3);
	await savedAction(lists.importMembers, owner, { id: list.id }, { text: "" }, 400);
});

test("list descriptions persist, validate one-line length, and survive rename and duplicate", async () => {
	const owner = "description-test";
	const lists = new SavedListRouter();
	const { list } = await savedAction(lists.createList, owner, {}, { name: "Seminar", description: "Weekly study partners" }, 201);
	assert.equal(list.description, "Weekly study partners");
	const updated = await savedAction(lists.renameList, owner, { id: list.id }, { description: "A".repeat(160) });
	assert.equal(updated.list.name, "Seminar");
	assert.equal((await SavedListModel.findByPk(list.id)).description, "A".repeat(160));
	await savedAction(lists.renameList, "another", { id: list.id }, { description: "Not yours" }, 404);
	await savedAction(lists.renameList, owner, { id: list.id }, { description: "A".repeat(161) }, 400);
	await savedAction(lists.renameList, owner, { id: list.id }, { description: "Two\nlines" }, 400);
	await savedAction(lists.renameList, owner, { id: list.id }, { name: "Renamed seminar" });
	const copy = await savedAction(lists.duplicateList, owner, { id: list.id }, {}, 201);
	assert.equal(copy.list.description, "A".repeat(160));
	assert.equal((await savedAction(lists.renameList, owner, { id: list.id }, { description: "" })).list.description, null);
});

test("only the last membership removal unsaves a contact, including concurrent removals", async () => {
	const owner = "last-membership-test";
	const lists = new SavedListRouter();
	const saved = new SavedRouter();
	const { list: a } = await savedAction(lists.createList, owner, {}, { name: "First" }, 201);
	const { list: b } = await savedAction(lists.createList, owner, {}, { name: "Second" }, 201);
	for(const list of [a, b]) await savedAction(saved.saveContact, owner, { netid: "ben1" }, { list_id: list.id, note: "Still saved elsewhere" });
	await people({ query: "ben", searchMode: "full_name" }, owner);
	const first = await savedAction(lists.removeMember, owner, { id: a.id, netid: "ben1" });
	assert.deepEqual(first, { saved: true, list_ids: [b.id] });
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid: "ben1" })).note, "Still saved elsewhere");
	const last = await savedAction(lists.removeMember, owner, { id: b.id, netid: "ben1" });
	assert.deepEqual(last, { saved: false, list_ids: [] });
	assert.equal(await SavedContactModel.count({ where: { owner_netid: owner, saved_netid: "ben1" } }), 0);
	assert.equal((await people({ query: "ben", searchMode: "full_name" }, owner)).find(person => person.netid === "ben1").saved_data.saved, false);
	for(const list of [a, b]) await savedAction(saved.saveContact, owner, { netid: "ben1" }, { list_id: list.id });
	await Promise.all([a, b].map(list => savedAction(lists.removeMember, owner, { id: list.id, netid: "ben1" })));
	assert.equal(await SavedContactModel.count({ where: { owner_netid: owner, saved_netid: "ben1" } }), 0);
});

test("deleting lists unsaves only people with no remaining memberships and does not resurrect them", async () => {
	const owner = "delete-membership-test";
	const lists = new SavedListRouter();
	const saved = new SavedRouter();
	const { list: a } = await savedAction(lists.createList, owner, {}, { name: "First" }, 201);
	const { list: b } = await savedAction(lists.createList, owner, {}, { name: "Second" }, 201);
	for(const list of [a, b]) await savedAction(saved.saveContact, owner, { netid: "ben1" }, { list_id: list.id, note: "Keep while in Second" });
	await savedAction(saved.saveContact, owner, { netid: "ben2" }, { list_id: a.id });
	const deleted = await savedAction(lists.deleteList, owner, { id: a.id });
	assert.deepEqual(deleted.unsaved_netids, ["ben2"]);
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid: "ben1" })).note, "Keep while in Second");
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid: "ben2" })).saved, false);
	await savedAction(lists.deleteList, owner, { id: b.id });
	const fresh = await savedAction(lists.getLists, owner);
	assert.equal(fresh.lists[0].name, "Friends");
	assert.equal(fresh.lists[0].count, 0);
	assert.equal(fresh.total, 0);
	await SavedContactModel.create({ owner_netid: owner, saved_netid: "ben2" });
	const cleaned = await savedAction(lists.getLists, owner);
	assert.deepEqual(cleaned.unsaved_netids, ["ben2"]);
	assert.equal((await savedAction(saved.getSavedContact, owner, { netid: "ben2" })).saved, false);
});
