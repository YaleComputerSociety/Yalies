import { DataTypes, Model, Op, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class FriendshipModel extends Model {
	declare requester_netid: string;
	declare requested_netid: string;
	declare status: "pending" | "accepted";
	declare created_at: Date;

	static initModel(sequelize: Sequelize) {
		FriendshipModel.init({
			requester_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			requested_netid: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "friendship",
			...SEQUELIZE_DEFINITION_OPTIONS,
			indexes: [
				{ fields: ["requested_netid"] },
			],
		});
	}

	static async getFriendCount(netid: string): Promise<number> {
		return FriendshipModel.count({
			where: {
				status: "accepted",
				[Op.or]: [
					{ requester_netid: netid },
					{ requested_netid: netid },
				],
			},
		});
	}

	static async getFriends(netid: string): Promise<string[]> {
		const rows = await FriendshipModel.findAll({
			where: {
				status: "accepted",
				[Op.or]: [
					{ requester_netid: netid },
					{ requested_netid: netid },
				],
			},
		});
		return rows.map(r =>
			r.requester_netid === netid ? r.requested_netid : r.requester_netid
		);
	}

	static async getPendingRequests(netid: string): Promise<string[]> {
		const rows = await FriendshipModel.findAll({
			where: {
				requested_netid: netid,
				status: "pending",
			},
		});
		return rows.map(r => r.requester_netid);
	}

	static async getStatus(netid1: string, netid2: string): Promise<"none" | "pending_sent" | "pending_received" | "accepted"> {
		const row = await FriendshipModel.findOne({
			where: {
				[Op.or]: [
					{ requester_netid: netid1, requested_netid: netid2 },
					{ requester_netid: netid2, requested_netid: netid1 },
				],
			},
		});
		if(!row) return "none";
		if(row.status === "accepted") return "accepted";
		if(row.requester_netid === netid1) return "pending_sent";
		return "pending_received";
	}
}
