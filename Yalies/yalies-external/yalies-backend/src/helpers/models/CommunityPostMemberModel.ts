import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class CommunityPostMemberModel extends Model {
	declare post_id: number;
	declare netid: string;
	declare role: "creator" | "member";
	declare joined_at: Date;

	static initModel(sequelize: Sequelize) {
		CommunityPostMemberModel.init({
			post_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
			netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			role: { type: DataTypes.STRING, allowNull: false, defaultValue: "member" },
			joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "community_post_member",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	toSanitizedObject() {
		return {
			post_id: this.post_id,
			netid: this.netid,
			role: this.role,
			joined_at: this.joined_at,
		};
	}
}
