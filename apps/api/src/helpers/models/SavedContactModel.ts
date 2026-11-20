import { DataTypes, Model, QueryTypes, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export const MAX_SAVED_NOTE_LENGTH = 1000;

export default class SavedContactModel extends Model {
	declare owner_netid: string;
	declare saved_netid: string;
	declare note: string | null;
	declare created_at: Date;

	static initModel(sequelize: Sequelize) {
		SavedContactModel.init({
			owner_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			saved_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			note: { type: DataTypes.TEXT, allowNull: true },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "saved_contact",
			...SEQUELIZE_DEFINITION_OPTIONS,
			indexes: [
				{ fields: ["owner_netid"] },
			],
		});
	}

	static async getSaved(ownerNetid: string): Promise<SavedContactModel[]> {
		return SavedContactModel.findAll({ where: { owner_netid: ownerNetid }, order: [["created_at", "DESC"]] });
	}

	static async getSavedNetids(ownerNetid: string): Promise<string[]> {
		const rows = await SavedContactModel.getSaved(ownerNetid);
		return rows.map(r => r.saved_netid);
	}

	static async countVisible(ownerNetid: string): Promise<number> {
		const [row] = await SavedContactModel.sequelize!.query<{ count: number }>(`
			SELECT COUNT(*)::int AS count
			FROM saved_contact s
			WHERE s.owner_netid = :ownerNetid
				AND EXISTS (SELECT 1 FROM person p WHERE p.netid = s.saved_netid)
		`, { replacements: { ownerNetid }, type: QueryTypes.SELECT });
		return row?.count ?? 0;
	}

	toSanitizedObject() {
		return {
			saved_netid: this.saved_netid,
			note: this.note,
			created_at: this.created_at,
		};
	}
}
