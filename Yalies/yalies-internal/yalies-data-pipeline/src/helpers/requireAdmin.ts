import { Request, Response, NextFunction } from "express";
import AdminModel from "../models/AdminModel.js";

type RequestUser = {
	netId?: string;
};

export default async function requireAdmin(req: Request, res: Response, next: NextFunction) {
	if (!req.isAuthenticated() || !req.user) return res.status(401).send("Unauthorized");
	const user = req.user as RequestUser;
	if (!user.netId) return res.status(401).send("No netId associated with logged-in user");
	req.netid = user.netId;

	try {
		const admin = await AdminModel.findOne({ where: { netid: user.netId } });
		if (!admin) return res.status(403).send("Not an admin");
		return next();
	} catch (error) {
		console.error(error);
		return res.status(500).send("Error checking admin status");
	}
}
