import { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy } from "passport-cas";
import AdminModel from "../models/AdminModel.js";

type RequestUser = {
	netId?: string;
};

export default class CAS {
	constructor() {
		this.initializePassport();
	}

	initializePassport = () => {
		passport.use(
			new Strategy(
				{
					version: "CAS2.0",
					ssoBaseURL: "https://secure.its.yale.edu/cas",
				},
				async (profile, done) => {
					return done(null, { netId: profile.user?.toLowerCase() });
				},
			),
		);
		passport.serializeUser((user: Express.User, done) => {
			done(null, user);
		});
		passport.deserializeUser((user: Express.User, done) => {
			done(null, user as Express.User);
		});
	};

	static requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
		if (!req.isAuthenticated() || !req.user) return res.status(401).send("Unauthorized");
		const user = req.user as RequestUser;
		if (!user.netId) return res.status(401).send("No netId associated with logged-in user");
		req.netid = user.netId;

		let admin: AdminModel | null;
		try {
			admin = await AdminModel.findOne({
				where: { netid: user.netId },
			});
		} catch (e) {
			console.error(e);
			return res.status(500).send("Error checking admin status");
		}
		if (!admin) return res.status(403).send("Not an admin");

		return next();
	};
}
