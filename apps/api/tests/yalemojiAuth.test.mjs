import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createSignedAuthAssertion, getYaleMojiFirstName } from "../build/helpers/yalemojiAuth.js";

test("greeting uses the preferred name, then first name, then no name", () => {
  assert.equal(getYaleMojiFirstName({ preferred_name: "  Alex ", first_name: "Alexander" }), "Alex");
  assert.equal(getYaleMojiFirstName({ preferred_name: "  ", first_name: " Zoë " }), "Zoë");
  assert.equal(getYaleMojiFirstName(null), undefined);
  assert.equal(getYaleMojiFirstName({ first_name: " " }), undefined);
  assert.equal(getYaleMojiFirstName({ first_name: "a".repeat(100) }).length, 80);
});

test("first name is inside the signed assertion and legacy assertions still work", () => {
  const secret = "test-secret";
  const [encoded, signature] = createSignedAuthAssertion(" ABC123 ", "valid-state", secret, 1800000000, " Alex ").split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  assert.equal(payload.netid, "abc123");
  assert.equal(payload.firstName, "Alex");
  assert.equal(signature, createHmac("sha256", secret).update(encoded).digest("base64url"));
  const [legacy] = createSignedAuthAssertion("abc123", "valid-state", secret, 1800000000).split(".");
  assert.equal(Object.hasOwn(JSON.parse(Buffer.from(legacy, "base64url").toString()), "firstName"), false);
});
