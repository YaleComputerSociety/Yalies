import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Sequelize, QueryTypes } from "sequelize";
import { buildFuzzyNameSearch, buildInitialsSearch, normalizeInitials } from "../build/helpers/nameSearch.js";

// Run against a development Postgres database with pg_trgm. All fixture writes
// live in a transaction and a temporary table; rollback leaves no persistent data.
const sql = new Sequelize(process.env.SEARCH_TEST_DATABASE_URL, { logging: false });
let transaction;
before(async () => {
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
		(6, 'Al', NULL, 'Ng', 'History')`, { transaction });
});
after(async () => { await transaction?.rollback(); await sql.close(); });

async function matches(query) {
	const { where, similarityOrder } = buildFuzzyNameSearch(sql, query);
	return (await sql.query(`SELECT id FROM search_fixture WHERE ${where.val} ORDER BY ${similarityOrder[0].val} DESC, id`, {
		transaction, type: QueryTypes.SELECT,
	})).map(row => row.id);
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
	assert.deepEqual(await matches("Al"), [6]);
	assert.deepEqual(await matches("JS"), []);
	assert.deepEqual(await matches("Computer Science"), []);
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
	assert.deepEqual((await sql.query(query, { transaction, type: QueryTypes.SELECT })).map(row => row.id), [1, 2, 3]);
});
