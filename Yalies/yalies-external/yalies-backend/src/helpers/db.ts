import { Sequelize } from "sequelize";
import PersonModel from "./models/PersonModel.js";
import SessionModel from "./models/SessionModel.js";
import APIKeyModel from "./models/APIKeyModel.js";
import UserProfileModel from "./models/UserProfileModel.js";
import ProfileLikeModel from "./models/ProfileLikeModel.js";
import FriendshipModel from "./models/FriendshipModel.js";
import CommunityPostModel from "./models/CommunityPostModel.js";
import CommunityPostMemberModel from "./models/CommunityPostMemberModel.js";
import CommunityPostInterestModel from "./models/CommunityPostInterestModel.js";
import DataChangeRequestModel from "./models/DataChangeRequestModel.js";

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
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS user_profile (
					netid VARCHAR(255) PRIMARY KEY,
					linkedin_url VARCHAR(255),
					instagram_url VARCHAR(255),
					classes TEXT[],
					updated_at TIMESTAMP
				);
			`);
			await this.#sql.query(`
				ALTER TABLE user_profile
				ADD COLUMN IF NOT EXISTS description TEXT,
				ADD COLUMN IF NOT EXISTS interests TEXT[];
			`);
			await this.#sql.query(`
				ALTER TABLE person
				ADD COLUMN IF NOT EXISTS address_state VARCHAR(10),
				ADD COLUMN IF NOT EXISTS address_country VARCHAR(255);
			`);
			await this.#sql.query(`
				CREATE INDEX IF NOT EXISTS idx_person_school ON person (school);
				CREATE INDEX IF NOT EXISTS idx_person_year ON person (year);
				CREATE INDEX IF NOT EXISTS idx_person_college ON person (college);
				CREATE INDEX IF NOT EXISTS idx_person_major ON person (major);
				CREATE INDEX IF NOT EXISTS idx_person_address_country ON person (address_country);
				CREATE INDEX IF NOT EXISTS idx_person_netid ON person (netid);
				CREATE INDEX IF NOT EXISTS idx_person_image_null ON person ((image IS NULL));
			`);
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS profile_like (
					liker_netid VARCHAR(255) NOT NULL,
					liked_netid VARCHAR(255) NOT NULL,
					created_at TIMESTAMP DEFAULT NOW(),
					PRIMARY KEY (liker_netid, liked_netid)
				);
			`);
			await this.#sql.query(`
				CREATE INDEX IF NOT EXISTS profile_like_liked_netid
				ON profile_like (liked_netid);
			`);
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS friendship (
					requester_netid VARCHAR(255) NOT NULL,
					requested_netid VARCHAR(255) NOT NULL,
					status VARCHAR(20) NOT NULL DEFAULT 'pending',
					created_at TIMESTAMP DEFAULT NOW(),
					PRIMARY KEY (requester_netid, requested_netid)
				);
			`);
			await this.#sql.query(`
				CREATE INDEX IF NOT EXISTS friendship_requested_netid
				ON friendship (requested_netid);
			`);
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS community_post (
					id SERIAL PRIMARY KEY,
					author_netid VARCHAR(255) NOT NULL,
					type VARCHAR(50) NOT NULL,
					title VARCHAR(500) NOT NULL,
					description TEXT,
					tags TEXT[] DEFAULT '{}',
					category VARCHAR(100) NOT NULL,
					competition_name VARCHAR(500),
					competition_date DATE,
					competition_url VARCHAR(1000),
					spots_total INTEGER,
					status VARCHAR(20) DEFAULT 'open',
					created_at TIMESTAMP DEFAULT NOW(),
					updated_at TIMESTAMP DEFAULT NOW()
				);
			`);
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS community_post_member (
					post_id INTEGER NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
					netid VARCHAR(255) NOT NULL,
					role VARCHAR(20) NOT NULL DEFAULT 'member',
					joined_at TIMESTAMP DEFAULT NOW(),
					PRIMARY KEY (post_id, netid)
				);
			`);
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS community_post_interest (
					post_id INTEGER NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
					netid VARCHAR(255) NOT NULL,
					message TEXT,
					created_at TIMESTAMP DEFAULT NOW(),
					PRIMARY KEY (post_id, netid)
				);
			`);
			await this.#sql.query(`
				CREATE INDEX IF NOT EXISTS idx_community_post_author ON community_post (author_netid);
				CREATE INDEX IF NOT EXISTS idx_community_post_type ON community_post (type);
				CREATE INDEX IF NOT EXISTS idx_community_post_category ON community_post (category);
				CREATE INDEX IF NOT EXISTS idx_community_post_status ON community_post (status);
				CREATE INDEX IF NOT EXISTS idx_community_post_created ON community_post (created_at DESC);
			`);
			await this.#sql.query(`
				CREATE TABLE IF NOT EXISTS data_change_request (
					id SERIAL PRIMARY KEY,
					requester_netid VARCHAR(255) NOT NULL,
					target_netid VARCHAR(255) NOT NULL,
					status VARCHAR(20) NOT NULL DEFAULT 'pending',
					requested_changes JSONB NOT NULL,
					admin_notes TEXT,
					created_at TIMESTAMP DEFAULT NOW(),
					resolved_at TIMESTAMP,
					resolved_by VARCHAR(255)
				);
			`);
			await this.#sql.query(`
				CREATE INDEX IF NOT EXISTS idx_dcr_status ON data_change_request (status);
				CREATE INDEX IF NOT EXISTS idx_dcr_requester ON data_change_request (requester_netid);
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
		UserProfileModel.initModel(this.#sql);
		ProfileLikeModel.initModel(this.#sql);
		FriendshipModel.initModel(this.#sql);
		CommunityPostModel.initModel(this.#sql);
		CommunityPostMemberModel.initModel(this.#sql);
		CommunityPostInterestModel.initModel(this.#sql);
		DataChangeRequestModel.initModel(this.#sql);
	};
};
