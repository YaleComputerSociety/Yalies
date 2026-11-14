import { Router, Request, Response } from "express";
import { QueryTypes, Sequelize } from "sequelize";
import { NOTIFICATION_COMPOSE_COLORS } from "yalies-shared";
import { normalizeNetid } from "../helpers/adminAccess.js";

// Mounted behind the same database-backed admin gate as photo review.
export function messageRouter(sql: Sequelize): Router {
	const router = Router();
	router.post("/", async (req: Request, res: Response) => {
		const to = normalizeNetid(req.body?.to);
		const { subject, message = "", color } = req.body ?? {};
		if (!to || typeof subject !== "string" || !subject.trim() || subject.length > 200
			|| typeof message !== "string" || !message.trim() || message.length > 4000 || !NOTIFICATION_COMPOSE_COLORS.includes(color)) {
			res.status(400).json({ error: "Enter a valid recipient NetID, subject (up to 200 characters), message (up to 4000 characters), and green, grey, or blue color." }); return;
		}
		try {
			const rows = await sql.query(`INSERT INTO notification ("to", subject, message, color)
				SELECT :to, :subject, :message, :color WHERE EXISTS (SELECT 1 FROM person WHERE lower(netid) = :to)
				RETURNING id, "to", subject, message, timestamp, color, viewed_at`, {
				replacements: { to, subject: subject.trim(), message: message.trim(), color }, type: QueryTypes.SELECT,
			});
			if (!rows.length) { res.status(404).json({ error: "That NetID is not in the directory. No message was sent." }); return; }
			res.status(201).json(rows[0]);
		} catch (error) {
			console.error("Send message error:", error);
			res.status(500).json({ error: "Could not send message" });
		}
	});
	router.get("/", async (req: Request, res: Response) => {
		const search = req.query.search ?? "";
		const status = req.query.status ?? "all";
		const page = Number(req.query.page ?? 1);
		if (typeof search !== "string" || search.length > 500 || typeof status !== "string" || !["all", "viewed", "unviewed"].includes(status)
			|| !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
			res.status(400).json({ error: "Invalid message search parameters" }); return;
		}
		const where = ["TRUE"];
		if (search.trim()) where.push(`("to" ILIKE :search ESCAPE '\\' OR subject ILIKE :search ESCAPE '\\' OR message ILIKE :search ESCAPE '\\')`);
		if (status === "viewed") where.push("viewed_at IS NOT NULL");
		if (status === "unviewed") where.push("viewed_at IS NULL");
		const replacements = { search: `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`, offset: (page - 1) * 50 };
		try {
			const [messages, counts] = await Promise.all([
				sql.query(`SELECT id, "to", subject, message, timestamp, color, viewed_at FROM notification
					WHERE ${where.join(" AND ")} ORDER BY timestamp DESC, id DESC LIMIT 50 OFFSET :offset`, { replacements, type: QueryTypes.SELECT }),
				sql.query<{ total: string }>(`SELECT COUNT(*) AS total FROM notification WHERE ${where.join(" AND ")}`, { replacements, type: QueryTypes.SELECT }),
			]);
			res.json({ messages, total: Number(counts[0].total), page, pageSize: 50 });
		} catch (error) {
			console.error("List messages error:", error);
			res.status(500).json({ error: "Could not load messages" });
		}
	});
	return router;
}
