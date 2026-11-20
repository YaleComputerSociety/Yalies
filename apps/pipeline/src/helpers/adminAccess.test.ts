import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import session from "express-session";
import passport from "passport";
import ConnectSessionSequelize from "connect-session-sequelize";
import { Sequelize, QueryTypes } from "sequelize";
import { initializeAdminAccess, normalizeNetid } from "./adminAccess.js";
import requireAdmin from "./requireAdmin.js";
import AdminModel from "../models/AdminModel.js";
import SessionModel from "../models/SessionModel.js";
import AdminRouter from "../routes/AdminRouter.js";

test("admin NetIDs are normalized and cannot be emails or arbitrary strings", () => {
	assert.equal(normalizeNetid(" YEF3 "), "yef3");
	for (const value of [null, 123, "", "yef3@yale.edu", "../yef3", "a b", "a".repeat(33)]) {
		assert.equal(normalizeNetid(value), null);
	}
});

const databaseUrl = process.env.ADMIN_TEST_DATABASE_URL;
test("dashboard access uses the database for bootstrap, grants, and active-session revocation", { skip: !databaseUrl }, async (t) => {
	const schema = `admin_test_${randomUUID().replaceAll("-", "")}`;
	const control = new Sequelize(databaseUrl!, { logging: false });
	await control.query(`CREATE SCHEMA "${schema}"`);
	const sql = new Sequelize(databaseUrl!, {
		logging: false,
		dialectOptions: { options: `-c search_path=${schema}` },
	});
	AdminModel.initModel(sql);
	SessionModel.initModel(sql);
	await sql.query("CREATE TABLE session (sid VARCHAR(255) PRIMARY KEY, netid VARCHAR(255), expires TIMESTAMP, data TEXT)");
	const Store = ConnectSessionSequelize(session.Store);
	const store = new Store({ db: sql, table: "SessionModel", checkExpirationInterval: 0 });
	const app = express();
	const auth = new passport.Passport();
	auth.serializeUser((user, done) => done(null, user));
	auth.deserializeUser((user: Express.User, done) => done(null, user));
	app.use(express.json());
	app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false, store }));
	app.use(auth.initialize());
	app.use(auth.session());
	// A test-only stand-in for a verified Yale CAS identity; never mounted in production.
	app.post("/test-login", (req, res, next) => {
		req.logIn({ netId: req.body.netid }, (error) => error ? next(error) : res.sendStatus(204));
	});
	app.use("/api/admins", requireAdmin, new AdminRouter().getRouter());
	app.get("/api/protected", requireAdmin, (_req, res) => res.json({ allowed: true }));
	const server = app.listen(0, "127.0.0.1");
	await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const request = (cookie: string, path: string, method = "GET", body?: unknown) => fetch(`${base}${path}`, {
		method, headers: { cookie, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const login = async (netid: string) => {
		const response = await request("", "/test-login", "POST", { netid });
		assert.equal(response.status, 204);
		return response.headers.get("set-cookie")!.split(";")[0];
	};
	try {
		await t.test("first migration replaces legacy admins with yef3, including simultaneous starts", async () => {
			await sql.query("CREATE TABLE admin (netid VARCHAR(255) PRIMARY KEY, added_at TIMESTAMP DEFAULT NOW())");
			await sql.query("INSERT INTO admin (netid) VALUES ('legacy1')");
			await Promise.all([initializeAdminAccess(sql), initializeAdminAccess(sql)]);
			assert.deepEqual((await AdminModel.findAll()).map((row) => row.netid), ["yef3"]);
		});
		const owner = await login("YEF3");
		const outsider = await login("other1");
		await t.test("anonymous and unlisted Yale accounts cannot read or change access", async () => {
			for (const [cookie, expected] of [["", 401], [outsider, 403]] as const) {
				assert.equal((await request(cookie, "/api/admins")).status, expected);
				assert.equal((await request(cookie, "/api/admins", "POST", { netid: "other1" })).status, expected);
				assert.equal((await request(cookie, "/api/admins/yef3", "DELETE")).status, expected);
			}
		});
		await t.test("admins can grant access, duplicate grants are harmless, malformed NetIDs fail", async () => {
			assert.equal((await request(owner, "/api/admins", "POST", { netid: " OTHER1 " })).status, 201);
			assert.equal((await request(owner, "/api/admins", "POST", { netid: "other1" })).status, 200);
			assert.equal((await request(owner, "/api/admins", "POST", { netid: "x@yale.edu" })).status, 400);
			assert.equal((await request(outsider, "/api/protected")).status, 200);
		});
		await t.test("restarting does not reset access changes", async () => {
			await initializeAdminAccess(sql);
			assert.deepEqual((await AdminModel.findAll({ order: [["netid", "ASC"]] })).map((row) => row.netid), ["other1", "yef3"]);
		});
		await t.test("self removal is rejected and removing another admin revokes their existing session", async () => {
			assert.equal((await request(owner, "/api/admins/yef3", "DELETE")).status, 409);
			assert.equal((await request(owner, "/api/admins/other1", "DELETE")).status, 204);
			assert.equal((await request(outsider, "/api/protected")).status, 403);
			assert.equal((await request(outsider, "/api/admins", "POST", { netid: "other2" })).status, 403);
		});
		await t.test("concurrent mutual revocations retain an administrator", async () => {
			await request(owner, "/api/admins", "POST", { netid: "other1" });
			const responses = await Promise.all([
				request(owner, "/api/admins/other1", "DELETE"),
				request(outsider, "/api/admins/yef3", "DELETE"),
			]);
			assert.deepEqual(responses.map((response) => response.status).sort(), [204, 403]);
			assert.equal(await AdminModel.count(), 1);
		});
		await t.test("the seed never resurrects a revoked yef3", async () => {
			await sql.query("DELETE FROM admin");
			await sql.query("INSERT INTO admin (netid) VALUES ('replacement1')");
			await initializeAdminAccess(sql);
			assert.deepEqual(await sql.query("SELECT netid FROM admin", { type: QueryTypes.SELECT }), [{ netid: "replacement1" }]);
		});
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
		await sql.close();
		await control.query(`DROP SCHEMA "${schema}" CASCADE`);
		await control.close();
	}
});
