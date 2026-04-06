import { Router, Request, Response } from "express";
import FacebookSource from "../sources/facebook.js";
import DirectorySource from "../sources/directory.js";

export default class CookieRouter {
	#router: Router;

	constructor() {
		this.#router = Router();
		this.#router.post("/validate", this.#validate);
	}

	getRouter = (): Router => this.#router;

	#validate = async (req: Request, res: Response): Promise<void> => {
		try {
			const { type, cookie } = req.body as { type: string; cookie: string };

			if (!type || !cookie) {
				res.status(400).send("Missing type or cookie in request body");
				return;
			}

			if (type !== "facebook" && type !== "directory") {
				res.status(400).send("type must be \"facebook\" or \"directory\"");
				return;
			}

			if (type === "facebook") {
				try {
					const source = new FacebookSource(cookie);
					await source.fetchPage(0);
					res.json({ valid: true, message: "Facebook cookie is valid" });
				} catch (e) {
					const err = e as Error;
					res.json({ valid: false, message: err.message });
				}
			} else {
				try {
					const source = new DirectorySource(cookie);
					await source.fetchCsrfToken();
					res.json({ valid: true, message: "Directory cookie is valid" });
				} catch (e) {
					const err = e as Error;
					res.json({ valid: false, message: err.message });
				}
			}
		} catch (e) {
			console.error("Cookie validation error:", e);
			res.status(500).send("Internal server error");
		}
	};
}
