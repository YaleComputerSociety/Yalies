import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";
import { UserProfile } from "yalies-shared";

export default class UserProfileModel extends Model {
	declare netid: string;
	declare show_yalemoji: boolean;
	declare description: string;
	declare interests: string[];
	declare linkedin_url: string;
	declare instagram_url: string;
	declare classes: string[];
	declare updated_at: Date;

	static initModel(sequelize: Sequelize) {
		UserProfileModel.init({
			netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			show_yalemoji: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
			description: { type: DataTypes.TEXT },
			interests: { type: DataTypes.ARRAY(DataTypes.STRING) },
			linkedin_url: { type: DataTypes.STRING },
			instagram_url: { type: DataTypes.STRING },
			classes: { type: DataTypes.ARRAY(DataTypes.STRING) },
			updated_at: { type: DataTypes.DATE },
		}, {
			sequelize,
			tableName: "user_profile",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	toSanitizedObject(): UserProfile {
		return {
			netid: this.netid,
			show_yalemoji: this.show_yalemoji !== false,
			...this.description != null && { description: this.description },
			...this.interests != null && { interests: this.interests },
			...this.linkedin_url != null && { linkedin_url: this.linkedin_url },
			...this.instagram_url != null && { instagram_url: this.instagram_url },
			...this.classes != null && { classes: this.classes },
			...this.updated_at != null && { updated_at: this.updated_at },
		};
	}
}
