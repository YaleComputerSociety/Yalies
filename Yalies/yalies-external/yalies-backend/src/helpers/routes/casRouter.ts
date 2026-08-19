import express, { Request, Response, NextFunction } from "express";
import passport from "passport";
import { RequestUser } from "../types";
import { createSignedAuthAssertion, isValidYaleMojiState, YaleMojiAuthError } from "../yalemojiAuth.js";

export default class CasRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.casLogin);
		router.get("/yalemoji", this.yaleMojiLogin);
		router.get("/logout", this.logout);
		return router;
	};

	casLogin = (req: Request, res: Response, next: NextFunction) => {
		const authFunction = passport.authenticate("cas", (err: Error, user: Express.User) => {
			if(err) {
				console.error(err);
				return res.status(500).send("Could not authenticate");
			}
			if(!user) return res.status(401).send("No user");
			const userWithData = user as RequestUser;

			return req.logIn(user, async (err) => {
				if(err) return res.status(500).send("Could not log in");
				req.session.netid = userWithData.netId;
				return res.redirect(process.env.FRONTEND_URL + "/");
			});
		});
		authFunction(req, res, next);
	};

	yaleMojiLogin = (req: Request, res: Response, next: NextFunction) => {
		const configuredErrorCallbackUrl = process.env.YALEMOJI_AUTH_ERROR_CALLBACK_URL;
		let errorCallbackUrl: URL;
		try {
			if(!configuredErrorCallbackUrl) throw new Error();
			errorCallbackUrl = new URL(configuredErrorCallbackUrl);
			if(errorCallbackUrl.protocol !== "https:" && errorCallbackUrl.protocol !== "http:") throw new Error();
		} catch {
			return res.status(500).send("YaleMoji authentication is not configured");
		}

		if(!isValidYaleMojiState(req.query.state)) {
			return this.redirectYaleMojiError(res, errorCallbackUrl, "invalid_state");
		}

		const secret = process.env.YALEMOJI_AUTH_SECRET;
		const configuredCallbackUrl = process.env.YALEMOJI_AUTH_CALLBACK_URL;
		if(!secret || !configuredCallbackUrl) {
			return this.redirectYaleMojiError(res, errorCallbackUrl, "configuration_error", req.query.state);
		}

		let callbackUrl: URL;
		try {
			callbackUrl = new URL(configuredCallbackUrl);
			if(callbackUrl.protocol !== "https:" && callbackUrl.protocol !== "http:") throw new Error();
		} catch {
			return this.redirectYaleMojiError(res, errorCallbackUrl, "configuration_error", req.query.state);
		}

		const state = req.query.state;
		const authFunction = passport.authenticate("cas", (err: Error, user: Express.User) => {
			if(err) {
				console.error("YaleMoji CAS authentication failed");
				return this.redirectYaleMojiError(res, errorCallbackUrl, "authentication_failed", state);
			}
			if(!user) return this.redirectYaleMojiError(res, errorCallbackUrl, "authentication_failed", state);

			const userWithData = user as RequestUser;
			const netid = userWithData.netId?.trim().toLowerCase();
			if(!netid) return this.redirectYaleMojiError(res, errorCallbackUrl, "identity_unavailable", state);

			return req.logIn(user, (loginError) => {
				if(loginError) return this.redirectYaleMojiError(res, errorCallbackUrl, "session_failed", state);
				req.session.netid = netid;

				const assertion = createSignedAuthAssertion(netid, state, secret);
				callbackUrl.searchParams.set("assertion", assertion);
				return res.redirect(callbackUrl.toString());
			});
		});
		authFunction(req, res, next);
	};

	redirectYaleMojiError = (res: Response, callbackUrl: URL, error: YaleMojiAuthError, state?: string) => {
		callbackUrl.searchParams.set("error", error);
		if(state) callbackUrl.searchParams.set("state", state);
		return res.redirect(callbackUrl.toString());
	};

	logout = (req: Request, res: Response) => {
		req.session.destroy(() => {
			req.logout({}, () => {
				res.redirect(process.env.FRONTEND_URL + "/");
			});
		});
	};
};
