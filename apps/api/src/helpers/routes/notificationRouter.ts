import { Router, type Request } from "express";
import { QueryTypes, Sequelize } from "sequelize";

export function notificationRouter(sql: Sequelize) {
	const router = Router();
	const frontendOrigin = new URL(process.env.FRONTEND_URL || "https://yalies.io").origin;
	router.use((req, res, next) => {
		// Session cookies use SameSite=None in production. Restrict both private
		// message reads and dismissals to the configured frontend origin.
		const origin = req.get("Origin");
		if(origin && origin !== frontendOrigin) { res.status(403).json({ error: "Untrusted origin" }); return; }
		next();
	});
	router.get("/", async (req: Request, res, next) => {
		try {
			res.json(await sql.query(`SELECT * FROM notification WHERE "to" = :to AND viewed_at IS NULL
				ORDER BY timestamp DESC, id DESC`, { replacements: { to: req.netid }, type: QueryTypes.SELECT }));
		} catch(error) { next(error); }
	});
	router.patch("/:id/viewed", async (req: Request, res, next) => {
		if(!/^[1-9][0-9]{0,18}$/.test(req.params.id) || BigInt(req.params.id) > 9223372036854775807n) { res.status(400).json({ error: "Invalid notification ID" }); return; }
		try {
			const rows = await sql.query(`UPDATE notification SET viewed_at = COALESCE(viewed_at, NOW())
				WHERE id = :id AND "to" = :to RETURNING id, viewed_at`, {
				replacements: { id: req.params.id, to: req.netid }, type: QueryTypes.SELECT,
			});
			if(!rows.length) { res.status(404).json({ error: "Notification not found" }); return; }
			res.json(rows[0]);
		} catch(error) { next(error); }
	});
	return router;
}
