import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { Request, Response } from "express";
import passport from "passport";
import devIdentity from "./devIdentity.js";
import requireAdmin from "./requireAdmin.js";
import AdminModel from "../models/AdminModel.js";

test("dev database access works without a login cookie and still checks the configured admin", async () => {
	const lookup = mock.method(AdminModel, "findOne", async () => ({}));
	try {
		const req = {} as Request;
		const res = {} as Response;
		passport.initialize()(req, res, () => {});
		devIdentity(" TestNetID ")(req, res, () => {});
		assert.equal(req.isAuthenticated(), true);
		let allowed = false;
		await requireAdmin(req, res, () => { allowed = true; });
		assert.equal(allowed, true);
		assert.deepEqual(lookup.mock.calls[0].arguments, [{ where: { netid: "testnetid" } }]);
	} finally { lookup.mock.restore(); }
});

test("dev identity does not grant database access to a non-admin", async () => {
	const lookup = mock.method(AdminModel, "findOne", async () => null);
	try {
		const req = {} as Request;
		let status = 0;
		const res = { status(code: number) { status = code; return this; }, send() {} } as unknown as Response;
		passport.initialize()(req, res, () => {});
		devIdentity("notadmin")(req, res, () => {});
		await requireAdmin(req, res, () => assert.fail("Non-admin must not reach the database route"));
		assert.equal(status, 403);
	} finally { lookup.mock.restore(); }
});

test("dev identity requires an explicit NetID", () => {
	assert.throws(() => devIdentity(undefined), /requires DEV_NETID/);
	assert.throws(() => devIdentity(" "), /requires DEV_NETID/);
});
