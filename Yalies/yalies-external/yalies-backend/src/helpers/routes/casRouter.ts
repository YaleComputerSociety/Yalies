import express, { Request, Response, NextFunction } from "express";
import passport from "passport";
import { RequestUser } from "../types";

export default class CasRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.casLogin);
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

	logout = (req: Request, res: Response) => {
		req.session.destroy(() => {
			req.logout({}, () => {
				res.redirect(process.env.FRONTEND_URL + "/");
			});
		});
	};
};
