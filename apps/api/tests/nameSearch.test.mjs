import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Sequelize, QueryTypes, Op } from "sequelize";
import { findNameSearchIds, buildInitialsSearch, normalizeInitials, NAME_SEARCH_SETUP_SQL, scoreName, scoreNameWord, keyboardDistance } from "../build/helpers/nameSearch.js";
import PeopleRouter from "../build/helpers/routes/peopleRouter.js";
import PersonModel from "../build/helpers/models/PersonModel.js";
import UserProfileModel from "../build/helpers/models/UserProfileModel.js";
import ProfileLikeModel from "../build/helpers/models/ProfileLikeModel.js";
import FriendshipModel from "../build/helpers/models/FriendshipModel.js";
import { RECENTS_SETUP_SQL } from "../build/helpers/db.js";

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
	for (const Model of [PersonModel, UserProfileModel, ProfileLikeModel, FriendshipModel]) {
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
	await FriendshipModel.create({ requester_netid: "viewer", requested_netid: "hl1", status: "accepted" });
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

async function people(body, netid = "viewer") {
	let status = 200;
	let result;
	const response = {
		status(code) { status = code; return this; },
		json(value) { result = value; return this; },
		send(value) { result = value; return this; },
	};
	await router.getPeople({ body: { searchMode: "full_name", ...body }, netid }, response);
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

test("people route falls back within inclusion, exclusion, and friendship filters", async () => {
	assert.deepEqual((await people({ query: "jennifer liu" })).map(person => person.id), [4]);
	assert.deepEqual((await people({ query: "jennifer liu", filters: { major: ["Math"] } })).map(person => person.id), [6, 5]);
	assert.deepEqual((await people({ query: "jennifer liu", exclude_filters: { major: ["History"] } })).map(person => person.id), [6, 5]);
	assert.deepEqual((await people({ query: "jennifer liu", filters: { is_friend: ["true"] } })).map(person => person.id), [6]);
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
