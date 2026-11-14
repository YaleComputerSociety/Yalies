import { Router, Request, Response } from "express";
import AdminModel from "../models/AdminModel.js";
import { normalizeNetid } from "../helpers/adminAccess.js";

export default class AdminRouter {
	getRouter = (): Router => {
		const router = Router();
		router.get("/", this.list);
		router.post("/", this.add);
		router.delete("/:netid", this.remove);
		return router;
	};

	list = async (_req: Request, res: Response) => {
		try {
			const admins = await AdminModel.findAll({ order: [["netid", "ASC"]] });
			return res.json({ admins: admins.map((admin) => admin.toSanitizedObject()) });
		} catch (error) {
			console.error("List admins error:", error);
			return res.status(500).json({ error: "Could not load dashboard access" });
		}
	};

	add = async (req: Request, res: Response) => {
		const netid = normalizeNetid(req.body?.netid);
		if (!netid) return res.status(400).json({ error: "Enter a Yale NetID, without @yale.edu" });
		try {
			const result = await AdminModel.sequelize!.transaction(async (transaction) => {
				await AdminModel.sequelize!.query("LOCK TABLE admin IN SHARE ROW EXCLUSIVE MODE", { transaction });
				if (!await AdminModel.findByPk(req.netid, { transaction })) return null;
				return AdminModel.findOrCreate({ where: { netid }, transaction });
			});
			if (!result) return res.status(403).json({ error: "Dashboard access has been revoked" });
			const [admin, created] = result;
			return res.status(created ? 201 : 200).json(admin.toSanitizedObject());
		} catch (error) {
			console.error("Add admin error:", error);
			return res.status(500).json({ error: "Could not grant dashboard access" });
		}
	};

	remove = async (req: Request, res: Response) => {
		const netid = normalizeNetid(req.params.netid);
		if (!netid) return res.status(400).json({ error: "Invalid NetID" });
		// An administrator cannot lock themselves (or the last administrator) out.
		if (netid === req.netid) return res.status(409).json({ error: "You cannot remove your own dashboard access" });
		try {
			// Serialize access changes and recheck the actor after locking. Two
			// admins revoking each other concurrently must not empty the table.
			const allowed = await AdminModel.sequelize!.transaction(async (transaction) => {
				await AdminModel.sequelize!.query("LOCK TABLE admin IN SHARE ROW EXCLUSIVE MODE", { transaction });
				if (!await AdminModel.findByPk(req.netid, { transaction })) return false;
				await AdminModel.destroy({ where: { netid }, transaction });
				return true;
			});
			if (!allowed) return res.status(403).json({ error: "Dashboard access has been revoked" });
			return res.sendStatus(204);
		} catch (error) {
			console.error("Remove admin error:", error);
			return res.status(500).json({ error: "Could not revoke dashboard access" });
		}
	};
}
