import { DataTypes, Model, Op, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export const MAX_SAVED_LIST_NAME_LENGTH = 50;
export const MAX_SAVED_LIST_DESCRIPTION_LENGTH = 160;
export const MAX_SAVED_LISTS = 50;

export default class SavedListModel extends Model {
	declare id: number;
	declare owner_netid: string;
	declare name: string;
	declare description: string | null;
	declare created_at: Date;

	static initModel(sequelize: Sequelize) {
		SavedListModel.init({
			id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			owner_netid: { type: DataTypes.STRING, allowNull: false },
			name: { type: DataTypes.STRING(100), allowNull: false },
			description: { type: DataTypes.STRING(MAX_SAVED_LIST_DESCRIPTION_LENGTH), allowNull: true },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "saved_list",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	static parseId(id: unknown): number | null {
		const listId = Number(id);
		return Number.isInteger(listId) && listId > 0 ? listId : null;
	}

	static async findOwned(ownerNetid: string, id: unknown): Promise<SavedListModel | null> {
		const listId = SavedListModel.parseId(id);
		if(listId === null) return null;
		return SavedListModel.findOne({ where: { id: listId, owner_netid: ownerNetid } });
	}

	static async getLists(ownerNetid: string): Promise<SavedListModel[]> {
		return SavedListModel.findAll({ where: { owner_netid: ownerNetid }, order: [["created_at", "ASC"], ["id", "ASC"]] });
	}

	static async isNameTaken(ownerNetid: string, name: string, exceptId?: number): Promise<boolean> {
		const row = await SavedListModel.findOne({
			where: {
				owner_netid: ownerNetid,
				...(exceptId !== undefined && { id: { [Op.ne]: exceptId } }),
				[Op.and]: Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("name")), name.toLowerCase()),
			},
		});
		return !!row;
	}

	toSanitizedObject(count: number) {
		return {
			id: this.id,
			name: this.name,
			description: this.description ?? null,
			count,
		};
	}
}
