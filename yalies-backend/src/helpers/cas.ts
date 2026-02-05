import { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy } from "passport-cas";
import PersonModel from "./models/PersonModel.js";
import { RequestUser } from "./types.js";
import APIKeyModel from "./models/APIKeyModel.js";

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
					return done(null, { netId: profile.user });
				},
			),
		);
		passport.serializeUser((user, done) => {
			done(null, user);
		});
		passport.deserializeUser((user, done) => {
			done(null, user);
		});
	};

	static requireAuthentication = async (req: Request, res: Response, next: NextFunction) => {
		if(req.headers.authorization) {
			return this.authenticateWithBearerToken(req, res, next);
		}
		return this.authenticateWithSession(req, res, next);
	};

	static requireAuthenticationSessionOnly = async (req: Request, res: Response, next: NextFunction) => {
		if(req.headers.authorization) {
			return res.status(403).send("This route is inaccessible to the public API. If you meant to authenticate with a session, remove the Authorization header.");
		}
		return this.authenticateWithSession(req, res, next);
	};

	static requireAuthenticationApiOnly = async (req: Request, res: Response, next: NextFunction) => {
		if(!req.headers.authorization) {
			return res.status(401).send("Must supply an Authorization header for this API-only route");
		}
		return this.authenticateWithBearerToken(req, res, next);
	};

	static authenticateWithSession = async (req: Request, res: Response, next: NextFunction) => {
		if (!req.isAuthenticated() || !req.user) return res.status(401).send("Unauthorized. Supply a session cookie or API key.");
		const user = req.user as RequestUser;
		if(!user.netId) return res.status(401).send("No netId associated with logged-in user");
		req.netid = user.netId;

		let person: PersonModel | null;
		try {
			person = await PersonModel.findOne({
				where: { netid: user.netId },
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching people while authenticating");
		}
		if(!person) return res.status(403).send("Not in directory");
		// TODO: Decide if we want to only allow YC students
		
		return next();
	};

	static authenticateWithBearerToken = async (req: Request, res: Response, next: NextFunction) => {
		const authorization = req.headers.authorization;

		if(!authorization.startsWith("Bearer ")) return res.status(401).send("Must prepend API key with `Bearer `");
		const token = authorization?.split(" ")[1];
		if(!token) return res.status(401).send("No token provided");
		
		let key: APIKeyModel | null;
		try {
			key = await APIKeyModel.findOne({
				where: { key: token },
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching API key while authenticating");
		}
		if(!key) return res.status(401).send("Invalid bearer token");
		req.netid = key.owner_netid;

		if(!req.secure && process.env.NODE_ENV !== "development") {
			// Delete the API key!!!!
			try {
				await key.destroy();
			} catch(e) {
				console.error(e);
				res.status(500).send("Internal server error");
				return;
			}
			return res.status(401).send("API keys must be used over HTTPS. Your key has been revoked for security reasons; please generate a new one.");
		}

		try {
			await key.increment("uses_count");
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error incrementing API key uses count");
		}

		return next();
	};
}
