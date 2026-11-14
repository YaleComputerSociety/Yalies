import passport from "passport";
import { Strategy } from "passport-cas";
import requireAdmin from "./requireAdmin.js";
import { normalizeNetid } from "./adminAccess.js";

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
					serverBaseURL: process.env.PIPELINE_URL || (process.env.NODE_ENV === "production" ? process.env.DASHBOARD_URL : undefined),
				},
				async (profile, done) => {
					const netId = normalizeNetid(profile.user);
					return done(null, netId ? { netId } : false);
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

	static requireAdmin = requireAdmin;
}
