import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Sequelize, QueryTypes, Op } from "sequelize";
import { buildExcludedFiltersWhere, buildLocationIncludesWhere, parseExcludedFilters } from "../build/helpers/filterExclusions.js";

// All fixture writes are confined to a temporary table in a rolled-back transaction.
if (!process.env.SEARCH_TEST_DATABASE_URL) throw new Error("Set SEARCH_TEST_DATABASE_URL to a development PostgreSQL database");
const sql = new Sequelize(process.env.SEARCH_TEST_DATABASE_URL, { logging: false });
let transaction;
before(async () => {
  transaction = await sql.transaction();
  await sql.query(`CREATE TEMP TABLE exclusion_fixture (id integer, year integer, college text, major text, address_country text, address_state text, address text) ON COMMIT DROP`, { transaction });
  await sql.query(`INSERT INTO exclusion_fixture VALUES
    (1, 2027, 'Berkeley College', 'History', 'United States', 'CA', 'Los Angeles, CA'),
    (2, 2028, 'Davenport College', 'Math', 'United States', 'NY', 'New York, NY'),
    (3, 2027, 'Berkeley College', 'Computer Science', 'Canada', 'ON', 'Toronto'),
    (4, NULL, NULL, NULL, NULL, NULL, 'Boston, United States'),
    (5, 2029, NULL, NULL, NULL, NULL, NULL),
    (6, 2028, 'Jonathan Edwards College', 'History', 'United Kingdom', NULL, 'London'),
    (7, 2028, 'Jonathan Edwards College', 'Computer Science', 'United States', NULL, NULL)`, { transaction });
});
after(async () => { await transaction?.rollback(); await sql.close(); });

async function matches(excluded, included = {}) {
  const where = { [Op.and]: [included, buildExcludedFiltersWhere(parseExcludedFilters(excluded))] };
  const query = sql.getQueryInterface().queryGenerator.selectQuery("exclusion_fixture", { attributes: ["id"], where, order: [["id", "ASC"]] });
  return (await sql.query(query, { transaction, type: QueryTypes.SELECT })).map(row => row.id);
}

test("year, college, and major exclusions combine and retain unknown values", async () => {
  assert.deepEqual(await matches({ year: ["2027"] }), [2, 4, 5, 6, 7]);
  assert.deepEqual(await matches({ college: ["Berkeley College"], major: ["History"] }), [2, 4, 5, 7]);
  assert.deepEqual(await matches({ college: ["Davenport College"], major: ["History"] }, { year: 2028 }), [7]);
});
test("country exclusions also match legacy addresses without dropping unknown locations", async () => {
  assert.deepEqual(await matches({ address_country: ["United States"] }), [3, 5, 6]);
  assert.deepEqual(await matches({ address_country: ["United States", "Canada"] }), [5, 6]);
});
test("include United States but exclude California; countries and states can be combined", async () => {
  assert.deepEqual(await matches({ address_state: ["CA"] }, buildLocationIncludesWhere({ address_country: ["United States"] })), [2, 4, 7]);
  assert.deepEqual(await matches({}, buildLocationIncludesWhere({ address_country: ["Canada"], address_state: ["NY"] })), [2, 3]);
  assert.deepEqual(await matches({ address_state: ["NY"] }, buildLocationIncludesWhere({ address_country: ["Canada"], address_state: ["NY"] })), [3]);
});
test("exclusion values cannot inject SQL or become wildcard patterns", async () => {
  assert.deepEqual(await matches({ address_country: ["%", "' OR 1=1 --"] }), [1, 2, 3, 4, 5, 6, 7]);
});
test("unsupported and malformed exclusions fail validation", () => {
  for (const input of [[], "year", { school: ["Yale College"] }, { year: ["nope"] }, { major: "History" }, { major: [null] }]) assert.throws(() => parseExcludedFilters(input));
  assert.deepEqual(parseExcludedFilters({ year: ["2027", "2027"], major: [] }), { year: ["2027"] });
});
