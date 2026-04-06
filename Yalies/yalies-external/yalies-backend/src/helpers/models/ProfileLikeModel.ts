import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class ProfileLikeModel extends Model {
	declare liker_netid: string;
	declare liked_netid: string;
	declare created_at: Date;

	static initModel(sequelize: Sequelize) {
		ProfileLikeModel.init({
			liker_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			liked_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "profile_like",
			...SEQUELIZE_DEFINITION_OPTIONS,
			indexes: [
				{ fields: ["liked_netid"] },
			],
		});
	}
}
