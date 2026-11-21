import { DataTypes, Model, Sequelize } from "sequelize";
import { DISCOVERY_FIELDS, type DiscoveryProfile } from "yalies-shared";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

// Deliberately separate from public user_profile and its serializers/deletion.
export default class DiscoveryProfileModel extends Model {
	declare netid: string;
	declare gender: DiscoveryProfile["gender"] | null;
	declare sexuality: DiscoveryProfile["sexuality"] | null;
	declare religion: DiscoveryProfile["religion"] | null;
	declare race: DiscoveryProfile["race"] | null;

	static initModel(sequelize: Sequelize) {
		DiscoveryProfileModel.init({
			netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			...Object.fromEntries(DISCOVERY_FIELDS.map(field => [`skip_${field}`, { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }])),
			...Object.fromEntries(DISCOVERY_FIELDS.map(field => [field, { type: field === "race" ? DataTypes.ARRAY(DataTypes.TEXT) : DataTypes.TEXT }])),
			updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
		}, { sequelize, tableName: "discovery_profile", ...SEQUELIZE_DEFINITION_OPTIONS });
	}

	toPrivateObject(): DiscoveryProfile {
		const skipped = DISCOVERY_FIELDS.filter(field => this.get(`skip_${field}`) === true);
		return { ...Object.fromEntries(DISCOVERY_FIELDS.flatMap(field => this[field] == null ? [] : [[field, this[field]]])),
			...(skipped.length ? { skipped } : {}),
		} as DiscoveryProfile;
	}
}
