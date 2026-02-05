import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class APIKeyModel extends Model {
	declare id: number;
	declare owner_netid: string;
	declare created_on: Date;
	declare description: string;
	declare key: string;
	declare uses_count: number;

	static initModel(sequelize: Sequelize) {
		APIKeyModel.init({
			id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
			owner_netid: { type: DataTypes.STRING, allowNull: false },
			created_on: { type: DataTypes.DATE, allowNull: false },
			description: { type: DataTypes.STRING, allowNull: false },
			key: { type: DataTypes.STRING, allowNull: false },
			uses_count: { type: DataTypes.INTEGER, allowNull: false },
		}, {
			sequelize,
			tableName: "api_key",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	};
};
