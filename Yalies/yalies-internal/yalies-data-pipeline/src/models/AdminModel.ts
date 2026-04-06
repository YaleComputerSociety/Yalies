import { DataTypes, Model, Sequelize } from "sequelize";

export default class AdminModel extends Model {
	declare netid: string;
	declare added_at: Date;

	static initModel(sequelize: Sequelize) {
		AdminModel.init({
			netid: { type: DataTypes.STRING, primaryKey: true },
			added_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "admin",
			paranoid: false,
			createdAt: false,
			updatedAt: false,
			deletedAt: false,
		});
	}
}
