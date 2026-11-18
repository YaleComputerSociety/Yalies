import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/helpers/yalemojiImageFit.ts", import.meta.url), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getAvatarImageFit } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function pixels(width, height, bounds, alpha = 255) {
	const data = new Uint8ClampedArray(width * height * 4);
	for(let y = bounds.y; y < bounds.y + bounds.height; y++) {
		for(let x = bounds.x; x < bounds.x + bounds.width; x++) data[(y * width + x) * 4 + 3] = alpha;
	}
	return data;
}
function visibleBox(fit, width, height, bounds) {
	const scaleX = parseFloat(fit.width) / 100 / width;
	const scaleY = parseFloat(fit.height) / 100 / height;
	assert.ok(Math.abs(scaleX - scaleY) < 1e-9, "preserves the artwork's aspect ratio");
	return {
		left: parseFloat(fit.left) / 100 + bounds.x * scaleX,
		top: parseFloat(fit.top) / 100 + bounds.y * scaleY,
		width: bounds.width * scaleX,
		height: bounds.height * scaleY,
	};
}

test("short hair, long hair, and off-center exports receive equal padding without clipping", () => {
	for(const bounds of [
		{ x: 25, y: 20, width: 50, height: 60 },
		{ x: 5, y: 2, width: 85, height: 96 },
		{ x: 0, y: 30, width: 40, height: 70 },
	]) {
		const fit = getAvatarImageFit(pixels(100, 100, bounds), 100, 100);
		assert.ok(fit);
		const box = visibleBox(fit, 100, 100, bounds);
		assert.ok(Math.abs(Math.max(box.width, box.height) - 0.94) < 1e-9);
		assert.ok(Math.abs(box.left - (1 - box.width) / 2) < 1e-9);
		assert.ok(Math.abs(box.top - (1 - box.height) / 2) < 1e-9);
		assert.ok(box.left >= 0.029 && box.top >= 0.029);
	}
});

test("faint transparent-edge noise does not change placement and empty images fall back", () => {
	const bounds = { x: 25, y: 20, width: 50, height: 60 };
	const data = pixels(100, 100, bounds);
	const expected = getAvatarImageFit(data, 100, 100);
	data[3] = 8;
	assert.deepEqual(getAvatarImageFit(data, 100, 100), expected);
	assert.equal(getAvatarImageFit(new Uint8ClampedArray(400), 10, 10), null);
});

test("non-square image canvases retain their original proportions", () => {
	const bounds = { x: 10, y: 20, width: 40, height: 100 };
	const fit = getAvatarImageFit(pixels(80, 160, bounds), 80, 160);
	const box = visibleBox(fit, 80, 160, bounds);
	assert.ok(Math.abs(box.height - 0.94) < 1e-9);
	assert.ok(Math.abs(box.width / box.height - 0.4) < 1e-9);
});
