import { QueryTypes, Sequelize } from "sequelize";

export { NOTIFICATION_SCHEMA_SQL } from "yalies-shared";

export async function createNotification(sql: Sequelize, input: { to: string; subject: string; message: string; color?: string }) {
	const { to, subject, message, color = "green" } = input;
	if(!/^[a-z][a-z0-9]*$/i.test(to) || !subject.trim()
		|| subject.length > 200 || message.length > 4000 || !["green", "grey", "blue", "amber", "red"].includes(color)) {
		throw new Error("Invalid notification");
	}
	const rows = await sql.query(`INSERT INTO notification ("to", subject, message, color)
		VALUES (:to, :subject, :message, :color) RETURNING *`, {
		replacements: { to: to.toLowerCase(), subject: subject.trim(), message: message.trim(), color },
		type: QueryTypes.SELECT,
	});
	return rows[0];
}
