import express, { Request, Response, NextFunction } from "express";
import passport from "passport";
import AdminModel from "../models/AdminModel.js";

type RequestUser = {
	netId?: string;
};

export default class CasRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.casLogin);
		router.get("/logout", this.logout);
		router.get("/me", this.me);
		return router;
	};

	casLogin = (req: Request, res: Response, next: NextFunction) => {
		const authFunction = passport.authenticate("cas", async (err: Error, user: Express.User) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Could not authenticate");
			}
			if (!user) return res.status(401).send("No user");
			const userWithData = user as RequestUser;

			// Check admin before logging in
			const admin = await AdminModel.findOne({ where: { netid: userWithData.netId } });
			if (!admin) {
				return res.redirect(process.env.DASHBOARD_URL + "/?error=not_admin");
			}

			return req.logIn(user, async (err) => {
				if (err) return res.status(500).send("Could not log in");
				req.session.netid = userWithData.netId;
				return res.redirect(process.env.DASHBOARD_URL + "/");
			});
		});
		authFunction(req, res, next);
	};

	me = async (req: Request, res: Response) => {
		if (!req.isAuthenticated() || !req.user) {
			return res.status(401).json({ authenticated: false });
		}

		const user = req.user as RequestUser;
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
