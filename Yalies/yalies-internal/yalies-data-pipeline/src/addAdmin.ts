import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import { Sequelize, QueryTypes } from "sequelize";

// Grants a netid access to the internal dashboard by inserting it into the
// `admin` table. Without this there is no way to bootstrap the first admin —
// every dashboard route 403s until a netid is present.
async function main(): Promise<void> {
	const netid = process.argv[2]?.toLowerCase();
	if (!netid) {
		console.log("Usage: npm run add-admin -- <netid>");
		process.exit(1);
	}
	if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL not set. See yalies-internal/README.md.");
		process.exit(1);
	}

	const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });
	try {
		await sequelize.authenticate();
		await sequelize.query(
			"CREATE TABLE IF NOT EXISTS admin (netid VARCHAR(255) PRIMARY KEY, added_at TIMESTAMP DEFAULT NOW())",
		);
		await sequelize.query(
			"INSERT INTO admin (netid) VALUES (:netid) ON CONFLICT (netid) DO NOTHING",
			{ type: QueryTypes.INSERT, replacements: { netid } },
		);
		console.log(`Added admin: ${netid}`);
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
