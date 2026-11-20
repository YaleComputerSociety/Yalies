import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Sequelize } from "sequelize";
import { messageRouter } from "./MessageRouter.js";
import requireAdmin from "../helpers/requireAdmin.js";
import AdminModel from "../models/AdminModel.js";

test("message editing validates input and requires current admin access", async (t) => {
	const original = { id: "42", to: "abc1", subject: "Old subject", message: "Old message", color: "green",
		timestamp: "2026-11-01T12:00:00.000Z", viewed_at: "2026-11-02T12:00:00.000Z" };
	let queries = 0;
	const sql = { query: async (query: string, options: { replacements: Record<string, string> }) => {
		queries++;
		assert.match(query, /UPDATE notification SET subject = :subject, message = :message, color = :color/);
		assert.match(query, /WHERE id = :id/);
		const { id, subject, message, color } = options.replacements;
		return id === original.id ? [{ ...original, subject, message, color }] : [];
	} } as unknown as Sequelize;
	t.mock.method(AdminModel, "findOne", async ({ where }: { where: { netid: string } }) => where.netid === "admin1" ? {} : null);
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		const netId = req.get("X-Test-Netid");
		req.isAuthenticated = (() => !!netId) as typeof req.isAuthenticated;
		if (netId) req.user = { netId };
		next();
	});
	app.use("/api/messages", requireAdmin, messageRouter(sql));
	const server = app.listen(0, "127.0.0.1");
	await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
	t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/messages`;
	const valid = { subject: " New subject ", message: " New message ", color: "blue" };
	const patch = (id: string, body: unknown, netid = "admin1") => fetch(`${base}/${id}`, {
		method: "PATCH", headers: { "Content-Type": "application/json", "X-Test-Netid": netid }, body: JSON.stringify(body),
	});
	await t.test("anonymous and non-admin users cannot edit", async () => {
		assert.equal((await patch("42", valid, "")).status, 401);
		assert.equal((await patch("42", valid, "other1")).status, 403);
		assert.equal(queries, 0);
	});
	await t.test("invalid IDs and content never reach the database", async () => {
		for (const id of ["0", "-1", "abc", "9223372036854775808"]) assert.equal((await patch(id, valid)).status, 400);
		for (const body of [null, {}, { ...valid, subject: " " }, { ...valid, subject: "a".repeat(201) },
			{ ...valid, message: 123 }, { ...valid, message: "a".repeat(4001) }, { ...valid, color: "purple" }]) {
			assert.equal((await patch("42", body)).status, 400);
		}
		assert.equal(queries, 0);
	});
	await t.test("editing preserves recipient, sent time, and dismissal even with extra fields", async () => {
		const response = await patch("42", { ...valid, to: "other1", timestamp: "today", viewed_at: null });
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { ...original, subject: "New subject", message: "New message", color: "blue" });
	});
	await t.test("system notifications with an empty body and legacy colors remain editable", async () => {
		const response = await patch("42", { ...valid, message: "", color: "amber" });
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { ...original, subject: "New subject", message: "", color: "amber" });
	});
	await t.test("missing messages return 404", async () => {
		assert.equal((await patch("43", valid)).status, 404);
	});
});
