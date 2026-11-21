import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const shared = await import("yalies-shared");
const exports = {};
const source = ts.transpileModule(readFileSync(new URL("../src/components/DiscoveryOptions.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
runInNewContext(source, { exports, require: id => id.endsWith(".scss") ? {} : id === "yalies-shared" ? shared : require(id) });
const update = (profile, field, value) => JSON.parse(JSON.stringify(exports.discoveryChoiceUpdate(profile, field, value)));

test("profile and setup use the same non-clearing choices and repeat clicks do not deselect", () => {
  assert.equal(update({ gender: "Male" }, "gender", "Male"), null);
  assert.deepEqual(update({ gender: "Male", skipped: ["gender"] }, "gender", "Male"), { gender: "Male" });
  assert.deepEqual(update({ gender: "Male" }, "gender", "Female"), { gender: "Female" });
  assert.equal(update({ religion: "Other" }, "religion", "Other"), null);
});

test("race toggles one option without losing others and can be cleared", () => {
  assert.deepEqual(update({ race: ["Asian"] }, "race", "Black"), { race: ["Asian", "Black"] });
  assert.deepEqual(update({ race: ["Asian", "Black"] }, "race", "Asian"), { race: ["Black"] });
  assert.deepEqual(update({ race: ["Asian"] }, "race", "Asian"), { race: [] });
});
