import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class CommunityPostInterestModel extends Model {
	declare post_id: number;
	declare netid: string;
	declare message: string;
	declare created_at: Date;

	static initModel(sequelize: Sequelize) {
		CommunityPostInterestModel.init({
			post_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
			netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			message: { type: DataTypes.TEXT },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "community_post_interest",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	toSanitizedObject() {
		return {
			post_id: this.post_id,
			netid: this.netid,
			...this.message != null && { message: this.message },
			created_at: this.created_at,
		};
	}
}
