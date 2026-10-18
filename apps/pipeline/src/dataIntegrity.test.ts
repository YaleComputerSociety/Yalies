import assert from "node:assert/strict";
import test from "node:test";
import { findStudentsWithStateMajor, isUsState } from "./dataIntegrity.js";

test("recognizes state codes and names without matching real majors", () => {
	assert.equal(isUsState("AL"), true);
	assert.equal(isUsState("Connecticut"), true);
	assert.equal(isUsState("Ethics,Politics & Economics"), false);
	assert.deepEqual(
		findStudentsWithStateMajor([
			{ major: "AL" },
			{ major: "Computer Science" },
		]),
		[{ major: "AL" }],
	);
});
