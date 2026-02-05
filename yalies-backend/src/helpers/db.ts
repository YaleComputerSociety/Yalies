import { Sequelize } from "sequelize";
import PersonModel from "./models/PersonModel.js";
import SessionModel from "./models/SessionModel.js";
import APIKeyModel from "./models/APIKeyModel.js";

export const SEQUELIZE_DEFINITION_OPTIONS = {
	paranoid: false,
	createdAt: false,
	updatedAt: false,
	deletedAt: false,
};

export default class DB {
	#sql: Sequelize;

	constructor() {
		this.#sql = new Sequelize(process.env.DATABASE_URL, {
			logging: false,
		});
		this.registerModels();
		this.initializeDb();
	}
	
	initializeDb = async () => {
		await this.testConnection();
		await this.setupDb();
	};

	setupDb = async () => {
		try {
			await this.#sql.query(`
				CREATE OR REPLACE FUNCTION first_last_name(text, text)
				RETURNS text AS $$
					SELECT concat_ws(' ', $1, $2);
				$$ LANGUAGE SQL IMMUTABLE;
			`);
			await this.#sql.query(`
				CREATE INDEX IF NOT EXISTS first_last_fuzzy
				ON person
				USING gin (first_last_name(first_name, last_name) gin_trgm_ops);
			`);
		} catch (error) {
			console.error("Error setting up database:", error);
		}
		console.log("Database setup complete");
	};

	getSql = () => this.#sql;

	testConnection = async () => {
		try {
			await this.#sql.authenticate();
			console.log("Connected to the database");
		} catch (error) {
			console.error("Unable to connect to the database:", error);
		}
	};

	registerModels = () => {
		PersonModel.initModel(this.#sql);
		SessionModel.initModel(this.#sql);
		APIKeyModel.initModel(this.#sql);
	};
};
