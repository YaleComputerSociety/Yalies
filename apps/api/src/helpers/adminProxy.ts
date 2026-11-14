import http from "node:http";
import https from "node:https";
import type { RequestHandler } from "express";

const HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

// Yale CAS accepts api.yalies.io, but rejects new Cloud Run hostnames. Forward
// only dashboard paths to the separate admin service, before public API sessions
// or body parsers run. The admin service verifies CAS and table membership.
export function createAdminProxy(serviceUrl: string): RequestHandler {
	const service = new URL(serviceUrl);
	if (!["http:", "https:"].includes(service.protocol) || service.username || service.password
		|| (process.env.NODE_ENV === "production" && service.protocol !== "https:")) {
		throw new Error("ADMIN_SERVICE_URL must be an HTTPS service origin in production");
	}
	const transport = service.protocol === "https:" ? https : http;
	return (req, res, next) => {
		if (!/^\/(admin|api)(\/|$|\?)/.test(req.originalUrl)) return next();
		const headers = { ...req.headers };
		for (const header of HOP_HEADERS) delete headers[header];
		headers.host = service.host;
		headers["x-forwarded-proto"] = req.protocol;
		headers["x-forwarded-host"] = req.get("host");
		const upstream = transport.request({
			hostname: service.hostname,
			port: service.port || undefined,
			method: req.method,
			path: req.originalUrl,
			headers,
		}, (response) => {
			res.status(response.statusCode || 502);
			for (const [name, value] of Object.entries(response.headers)) {
				if (value !== undefined && !HOP_HEADERS.has(name)) res.setHeader(name, value);
			}
			response.on("error", () => res.destroy());
			response.pipe(res);
		});
		upstream.on("error", (error) => {
			console.error("Admin service request failed:", error.message);
			if (!res.headersSent) res.status(502).json({ error: "Dashboard is temporarily unavailable" });
			else res.destroy();
		});
		req.on("aborted", () => upstream.destroy());
		res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
		req.pipe(upstream);
	};
}
