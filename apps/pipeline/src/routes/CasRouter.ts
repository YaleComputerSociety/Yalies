import express, { Request, Response, NextFunction } from "express";
import passport from "passport";
import AdminModel from "../models/AdminModel.js";
import { normalizeNetid } from "../helpers/adminAccess.js";

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
			try {
				if (err) {
					console.error(err);
					return res.status(500).send("Could not authenticate");
				}
				if (!user) return res.status(401).send("No user");
				const userWithData = user as RequestUser;
				const netid = normalizeNetid(userWithData.netId);
				if (!netid) return res.status(401).send("No NetID in Yale login");

				const admin = await AdminModel.findOne({ where: { netid } });
				if (!admin) {
					return res.redirect(process.env.DASHBOARD_URL + "/?error=not_admin");
				}

				return req.logIn({ netId: netid }, (err) => {
					if (err) return res.status(500).send("Could not log in");
					req.session.netid = netid;
					return req.session.save((saveError) => {
						if (saveError) return res.status(500).send("Could not save login");
						return res.redirect(process.env.DASHBOARD_URL + "/");
					});
				});
			} catch (e) {
				console.error("CAS login error:", e);
				return res.status(500).send("Could not authenticate");
			}
		});
		authFunction(req, res, next);
	};

	me = async (req: Request, res: Response) => {
		try {
			if (!req.isAuthenticated() || !req.user) {
				return res.status(401).json({ authenticated: false });
			}

			const user = req.user as RequestUser;
			const netid = normalizeNetid(user.netId);
			if (!netid) {
				return res.status(401).json({ authenticated: false });
			}

			const admin = await AdminModel.findOne({ where: { netid } });
			return res.json({
				authenticated: true,
				netid,
				isAdmin: !!admin,
			});
		} catch (e) {
			console.error("CAS me error:", e);
			return res.status(500).json({ authenticated: false });
		}
	};

	logout = (req: Request, res: Response) => {
		req.logout({}, () => {
			req.session.destroy(() => {
				res.clearCookie("yalies.pipeline.sid");
				res.redirect(process.env.DASHBOARD_URL + "/");
			});
		});
	};
}
