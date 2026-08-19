import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
	createSignedAuthAssertion,
	isValidYaleMojiState,
	YALEMOJI_ASSERTION_TTL_SECONDS,
} from "../build/helpers/yalemojiAuth.js";

const secret = "a-test-secret-that-is-never-used-in-production";

const decodeAssertion = (assertion) => {
	const [encodedPayload, signature] = assertion.split(".");
	return {
		encodedPayload,
		payload: JSON.parse(Buffer.from(encodedPayload, "base64url").toString()),
		signature,
	};
};

const expectedSignature = (encodedPayload) => createHmac("sha256", secret)
	.update(encodedPayload)
	.digest("base64url");

test("creates a short-lived, audience-bound assertion with normalized NetID and preserved state", () => {
	const state = "random_state-123~value";
	const now = 1_700_000_000;
	const decoded = decodeAssertion(createSignedAuthAssertion("  GRACE.HOPPER  ", state, secret, now));

	assert.deepEqual(decoded.payload, {
		v: 1,
		iss: "yalies",
		aud: "yalemoji",
		netid: "grace.hopper",
		iat: now,
		exp: now + YALEMOJI_ASSERTION_TTL_SECONDS,
		state,
	});
	assert.equal(decoded.signature, expectedSignature(decoded.encodedPayload));
});

test("different payloads produce different signatures", () => {
	const first = decodeAssertion(createSignedAuthAssertion("first", "state-one", secret, 1)).signature;
	const second = decodeAssertion(createSignedAuthAssertion("second", "state-two", secret, 1)).signature;
	assert.notEqual(first, second);
});

test("tampering with the payload invalidates the signature", () => {
	const decoded = decodeAssertion(createSignedAuthAssertion("original", "state", secret, 1));
	const tamperedPayload = Buffer.from(JSON.stringify({ ...decoded.payload, netid: "attacker" })).toString("base64url");
	assert.notEqual(decoded.signature, expectedSignature(tamperedPayload));
});

test("rejects malformed or missing state", () => {
	assert.equal(isValidYaleMojiState(undefined), false);
	assert.equal(isValidYaleMojiState(""), false);
	assert.equal(isValidYaleMojiState("contains spaces"), false);
	assert.equal(isValidYaleMojiState("x".repeat(513)), false);
	assert.equal(isValidYaleMojiState("valid_state-123"), true);
	assert.throws(() => createSignedAuthAssertion("netid", "invalid state", secret));
});
