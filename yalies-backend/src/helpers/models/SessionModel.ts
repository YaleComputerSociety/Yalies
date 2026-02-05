import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class SessionModel extends Model {
	declare sid: string;
	declare netid: string;
	declare expires: Date;
	declare data: string;

	static initModel(sequelize: Sequelize) {
		SessionModel.init({
			sid: { type: DataTypes.STRING, primaryKey: true },
			netid: { type: DataTypes.STRING },
			expires: { type: DataTypes.DATE },
			data: { type: DataTypes.TEXT },
		}, {
			sequelize,
			tableName: "session",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	};
};
