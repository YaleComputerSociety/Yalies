import express, { Request, Response } from "express";
import AdminModel from "../models/AdminModel.js";

export default class DevLoginRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.devLogin);
		router.get("/logout", this.logout);
		router.get("/me", this.me);
		return router;
	};

	devLogin = (req: Request, res: Response) => {
		const netId = process.env.DEV_NETID;
		if (!netId) {
			return res.status(500).send("DEV_NETID not set in .env");
		}

		const user = { netId };
		return req.logIn(user, (err) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Could not log in");
			}
			req.session.netid = netId;
			console.log(`[Dev Auth] Logged in as ${netId}`);
			return res.redirect(process.env.DASHBOARD_URL + "/");
		});
	};

	me = async (req: Request, res: Response) => {
		if (!req.isAuthenticated() || !req.user) {
			return res.status(401).json({ authenticated: false });
		}

		const user = req.user as { netId?: string };
		const netid = user.netId || req.session.netid;
		if (!netid) {
			return res.status(401).json({ authenticated: false });
		}

		const admin = await AdminModel.findOne({ where: { netid } });
		return res.json({
			authenticated: true,
			netid,
			isAdmin: !!admin,
		});
	};

	logout = (req: Request, res: Response) => {
		req.session.destroy(() => {
			req.logout({}, () => {
				res.redirect(process.env.DASHBOARD_URL + "/");
			});
		});
	};
}
