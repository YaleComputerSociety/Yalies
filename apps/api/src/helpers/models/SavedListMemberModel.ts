import { DataTypes, Model, Op, QueryTypes, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class SavedListMemberModel extends Model {
	declare list_id: number;
	declare owner_netid: string;
	declare saved_netid: string;
	declare created_at: Date;

	static initModel(sequelize: Sequelize) {
		SavedListMemberModel.init({
			list_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
			owner_netid: { type: DataTypes.STRING, allowNull: false },
			saved_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "saved_list_member",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	static async getListIds(ownerNetid: string, savedNetids: string[]): Promise<Map<string, number[]>> {
		const listIds = new Map<string, number[]>();
		if(savedNetids.length === 0) return listIds;
		const rows = await SavedListMemberModel.findAll({
			where: { owner_netid: ownerNetid, saved_netid: { [Op.in]: savedNetids } },
			order: [["list_id", "ASC"]],
		});
		for(const row of rows) {
			listIds.set(row.saved_netid, [...listIds.get(row.saved_netid) ?? [], row.list_id]);
		}
		return listIds;
	}

	static async getNetids(ownerNetid: string, listIds: number[]): Promise<string[]> {
		const rows = await SavedListMemberModel.findAll({
			where: { owner_netid: ownerNetid, list_id: { [Op.in]: listIds } },
			order: [["created_at", "DESC"]],
		});
		return [...new Set(rows.map(r => r.saved_netid))];
	}

	static async countByList(ownerNetid: string): Promise<Map<number, number>> {
		const rows = await SavedListMemberModel.sequelize!.query<{ list_id: number; count: number }>(`
			SELECT m.list_id, COUNT(*)::int AS count
			FROM saved_list_member m
			WHERE m.owner_netid = :ownerNetid
				AND EXISTS (SELECT 1 FROM person p WHERE p.netid = m.saved_netid)
			GROUP BY m.list_id
		`, { replacements: { ownerNetid }, type: QueryTypes.SELECT });
		return new Map(rows.map(r => [r.list_id, r.count]));
	}
}
