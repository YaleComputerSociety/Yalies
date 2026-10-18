import assert from "node:assert/strict";
import test from "node:test";
import { isPlaceholderCookie, isSupportedImageBuffer } from "./sources/facebook.js";

test("isSupportedImageBuffer accepts supported image signatures", () => {
	assert.equal(isSupportedImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), true);
	assert.equal(isSupportedImageBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), true);
	assert.equal(isSupportedImageBuffer(Buffer.from("GIF89aabcdef", "ascii")), true);
	assert.equal(isSupportedImageBuffer(Buffer.from("RIFFxxxxWEBP", "ascii")), true);
});

test("isSupportedImageBuffer rejects HTML mislabeled as an image", () => {
	assert.equal(isSupportedImageBuffer(Buffer.from("<!DOCTYPE html><html><title>CAS</title>")), false);
});

test("isPlaceholderCookie detects the documentation placeholder", () => {
	assert.equal(isPlaceholderCookie("<current JSESSIONID or full Cookie header>"), true);
	assert.equal(isPlaceholderCookie("JSESSIONID=real-session-value; CASTGC=real-ticket"), false);
});
