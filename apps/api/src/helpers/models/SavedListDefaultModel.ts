import { DataTypes, Model, Sequelize, Transaction } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class SavedListDefaultModel extends Model {
	declare owner_netid: string;
	declare list_id: number | null;

	static initModel(sequelize: Sequelize) {
		SavedListDefaultModel.init({
			owner_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			list_id: { type: DataTypes.INTEGER, allowNull: true },
		}, {
			sequelize,
			tableName: "saved_list_default",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	static async getDefault(ownerNetid: string): Promise<number | null> {
		const row = await SavedListDefaultModel.findByPk(ownerNetid);
		return row?.list_id ?? null;
	}

	static async setDefault(ownerNetid: string, listId: number | null, transaction?: Transaction) {
		await SavedListDefaultModel.upsert({ owner_netid: ownerNetid, list_id: listId }, { transaction });
	}
}
