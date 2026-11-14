import { QueryTypes, Sequelize } from "sequelize";

export function normalizeNetid(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const netid = value.trim().toLowerCase();
	return /^[a-z][a-z0-9]{0,31}$/.test(netid) ? netid : null;
}

// Apply the requested yef3-only access list once. Later restarts must preserve
// grants and revocations made from the dashboard, including removal of yef3.
export async function initializeAdminAccess(sequelize: Sequelize): Promise<void> {
	await sequelize.transaction(async (transaction) => {
		await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('yalies.admin.bootstrap'))", { transaction });
		await sequelize.query(`
			CREATE TABLE IF NOT EXISTS admin (
				netid VARCHAR(255) PRIMARY KEY,
				added_at TIMESTAMP DEFAULT NOW()
			)
		`, { transaction });
		await sequelize.query(`
			CREATE TABLE IF NOT EXISTS admin_migration (
				name TEXT PRIMARY KEY,
				applied_at TIMESTAMP DEFAULT NOW()
			)
		`, { transaction });
		const applied = await sequelize.query<{ name: string }>(
			"SELECT name FROM admin_migration WHERE name = 'initial-yef3-access'",
			{ type: QueryTypes.SELECT, transaction },
		);
		if (applied.length) return;
		await sequelize.query("DELETE FROM admin", { transaction });
		await sequelize.query("INSERT INTO admin (netid) VALUES ('yef3')", { transaction });
		await sequelize.query("INSERT INTO admin_migration (name) VALUES ('initial-yef3-access')", { transaction });
	});
}
