import assert from "node:assert/strict";
import test from "node:test";
import { decodeTextResponse } from "./httpClient.js";

test("decodes valid UTF-8 without changing accented names", () => {
	const input = Buffer.from("Pérez-Mariño, César", "utf8");
	assert.equal(decodeTextResponse(input), "Pérez-Mariño, César");
});

test("falls back to Windows-1252 for legacy Face Book bytes", () => {
	const input = Buffer.from([
		0x50, 0xe9, 0x72, 0x65, 0x7a, 0x2d, 0x4d, 0x61, 0x72, 0x69, 0xf1, 0x6f,
		0x2c, 0x20, 0x43, 0xe9, 0x73, 0x61, 0x72,
	]);
	assert.equal(decodeTextResponse(input), "Pérez-Mariño, César");
});
