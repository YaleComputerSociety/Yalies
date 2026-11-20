import assert from "node:assert/strict";
import test from "node:test";
import { filterExclusionUpdate, filterSelectionUpdate, selectedFilterValues, splitFilterSelections } from "../../apps/web/src/helpers/filterSelection.ts";

test("minus and plus move one selected value between include and exclude without losing other choices", () => {
  let filters = { year: ["2027", "2028"], college: ["Berkeley College"] };
  filters = { ...filters, ...filterExclusionUpdate(filters, "year", "2027") };
  assert.deepEqual(filters.year, ["2028"]);
  assert.deepEqual(filters.exclude_year, ["2027"]);
  assert.deepEqual(filters.college, ["Berkeley College"]);
  assert.deepEqual(selectedFilterValues(filters, "year"), ["2028", "2027"]);
  filters = { ...filters, ...filterExclusionUpdate(filters, "year", "2027") };
  assert.deepEqual(filters.year.sort(), ["2027", "2028"]);
  assert.deepEqual(filters.exclude_year, []);
});

test("unchecking an excluded value removes its exclusion and clearing removes both modes", () => {
  const filters = { major: ["History"], exclude_major: ["Math", "Physics"] };
  assert.deepEqual(filterSelectionUpdate(filters, "major", ["History", "Physics"]), { major: ["History"], exclude_major: ["Physics"] });
  assert.deepEqual(filterSelectionUpdate(filters, "major", []), { major: [], exclude_major: [] });
});

test("search payload separates exclusions, including country plus excluded state", () => {
  assert.deepEqual(splitFilterSelections({ school: ["Yale College"], address_country: ["United States"], exclude_address_state: ["CA"], exclude_year: ["2027"], major: [] }), {
    filterObject: { school: ["Yale College"], address_country: ["United States"] },
    excludedFilterObject: { address_state: ["CA"], year: ["2027"] },
  });
});
