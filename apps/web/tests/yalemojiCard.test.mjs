import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function card(person, netid) {
	function loadComponent(file) {
		const exports = {};
		const source = ts.transpileModule(readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), "utf8"), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
		}).outputText;
		runInNewContext(source, {
			exports,
			require: id => {
				if(id.endsWith(".scss")) return {};
				if(id === "./NavigationShell") return { useSession: () => ({ netid }) };
				if(id === "./CardYaleMoji") return loadComponent("CardYaleMoji");
				if(id === "@/hooks/useYaleMojiImageFit") return { useYaleMojiImageFit: () => undefined };
				if(id === "@/hooks/expandedYaleMoji") return {
					getExpandedYaleMoji: () => null, subscribeExpandedYaleMoji: () => () => {}, setExpandedYaleMoji: () => {},
				};
				return require(id);
			},
		});
		return exports;
	}
	return renderToStaticMarkup(React.createElement(loadComponent("PersonCardShell").default, { person, onOpen: () => {} }, "Person details"));
}

test("only the viewer's own card shows a default avatar", () => {
	const person = { netid: "me1", first_name: "Me", last_name: "Test" };
	const ownCard = card(person, "me1");
	assert.match(ownCard, /default-avatar\.png/);
	assert.match(ownCard, /data-has-yalemoji="true"/);
	for(const [personNetid, viewerNetid] of [["other1", "me1"], ["me1", undefined], [undefined, undefined]]) {
		const otherCard = card({ ...person, netid: personNetid }, viewerNetid);
		assert.doesNotMatch(otherCard, /default-avatar\.png/);
		assert.match(otherCard, /data-has-yalemoji="false"/);
	}
});

test("personal avatars still render for both the viewer and other people", () => {
	const person = { netid: "other1", first_name: "Other", last_name: "Test", yalemoji: { png_url: "https://example.com/avatar.png" } };
	for(const viewerNetid of ["me1", "other1"]) {
		const html = card(person, viewerNetid);
		assert.match(html, /https:\/\/example\.com\/avatar\.png/);
		assert.doesNotMatch(html, /default-avatar\.png/);
		assert.match(html, /data-has-yalemoji="true"/);
	}
});

test("opting out hides personal and default avatars for every viewer", () => {
	for(const yalemoji of [null, { png_url: "https://example.com/avatar.png", background_url: "https://example.com/bg.svg" }]) {
		const person = { netid: "hidden1", first_name: "Hidden", last_name: "Test", yalemoji,
			user_profile: { netid: "hidden1", show_yalemoji: false } };
		for(const viewer of ["hidden1", "other1", undefined]) {
			const html = card(person, viewer);
			assert.doesNotMatch(html, /avatar\.png|bg\.svg|Yalemoji status|Expand .*Yalemoji/);
			assert.match(html, /data-has-yalemoji="false"/);
			assert.match(html, /Person details/);
		}
	}
});
