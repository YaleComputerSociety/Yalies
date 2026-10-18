import type { RequestHandler } from "express";

// Dev mode has a configured identity rather than a CAS login. Apply it to every
// request so the local dashboard does not depend on a browser login cookie.
export default function devIdentity(netid: string | undefined): RequestHandler {
	const netId = netid?.trim().toLowerCase();
	if (!netId) throw new Error("AUTH_MODE=dev requires DEV_NETID");
	return (req, _res, next) => {
		req.user = { netId };
		next();
	};
}
