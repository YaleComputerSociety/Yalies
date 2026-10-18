import { Request, Response } from "express";
import { validInteractionId } from "./security.js";

declare module "express-session" {
	interface SessionData {
		oidcContinuation?: { uid: string; expires: number };
		oidcConsent?: Record<string, { csrf: string; netid: string; expires: number }>;
	}
}

// Capture before Passport 0.7 regenerates the session on login.
export function takeOidcContinuation(req: Request) {
	const pending = req.session.oidcContinuation;
	return pending && pending.expires > Date.now() && validInteractionId(pending.uid)
		? `/oauth/interaction/${pending.uid}` : undefined;
}

export function finishLogin(req: Request, res: Response, continuation?: string) {
	delete req.session.oidcContinuation;
	req.session.save(err => {
		if(err) return res.status(500).send("Could not save login");
		return res.redirect(continuation || process.env.FRONTEND_URL + "/");
	});
}
