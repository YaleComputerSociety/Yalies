import express, { Request, Response } from "express";

export default class DevLoginRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", this.devLogin);
		router.get("/logout", this.logout);
		return router;
	};

	devLogin = (req: Request, res: Response) => {
		const netId = process.env.DEV_NETID;
		if(!netId) {
			return res.status(500).send("DEV_NETID not set in .env.development");
		}

		const user = { netId };
		return req.logIn(user, (err) => {
			if(err) {
				console.error(err);
				return res.status(500).send("Could not log in");
			}
			req.session.netid = netId;
			console.log(`[Dev Auth] Logged in as ${netId}`);
			return res.redirect(process.env.FRONTEND_URL + "/");
		});
	};

	logout = (req: Request, res: Response) => {
		req.session.destroy(() => {
			req.logout({}, () => {
				res.redirect(process.env.FRONTEND_URL + "/");
			});
		});
	};
}
