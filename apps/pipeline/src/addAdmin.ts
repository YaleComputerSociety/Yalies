import { fileURLToPath } from "node:url";
import { configDotenv } from "dotenv";
configDotenv({ path: process.env.YALIES_PIPELINE_ENV_FILE || fileURLToPath(new URL("../../../.config/internal/.env.data-pipeline", import.meta.url)), override: true });

import { Sequelize, QueryTypes } from "sequelize";
import { initializeAdminAccess, normalizeNetid } from "./helpers/adminAccess.js";

// Recovery tool for the dashboard's admin table. Normal grants and revocations
// happen on the dashboard's Access page after the initial yef3-only migration.
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const netid = normalizeNetid(args.find((arg) => !arg.startsWith("--")));
	const onlyAdmin = args.includes("--only");
	if (!netid) {
		console.log("Usage: npm run add-admin -- <netid> [--only]");
		process.exit(1);
	}
	if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL not set. See ONBOARDING.md.");
		process.exit(1);
	}

	const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });
	try {
		await sequelize.authenticate();
		await initializeAdminAccess(sequelize);
		await sequelize.transaction(async (transaction) => {
			await sequelize.query(
				"CREATE TABLE IF NOT EXISTS admin (netid VARCHAR(255) PRIMARY KEY, added_at TIMESTAMP DEFAULT NOW())",
				{ transaction },
			);
			if (onlyAdmin) {
				await sequelize.query(
					"DELETE FROM admin WHERE LOWER(netid) != :netid",
					{ type: QueryTypes.DELETE, replacements: { netid }, transaction },
				);
			}
			await sequelize.query(
				"INSERT INTO admin (netid) VALUES (:netid) ON CONFLICT (netid) DO NOTHING",
				{ type: QueryTypes.INSERT, replacements: { netid }, transaction },
			);
		});
		console.log(onlyAdmin ? `Set sole admin: ${netid}` : `Added admin: ${netid}`);
	} finally {
		await sequelize.close();
	}
}

(async () => {
	try {
		await main();
	} catch (e) {
		console.error("Error:", e);
		process.exit(1);
	}
})();
