import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class DataChangeRequestModel extends Model {
	declare id: number;
	declare requester_netid: string;
	declare target_netid: string;
	declare status: "pending" | "approved" | "denied";
	declare requested_changes: Record<string, string | number | null>;
	declare admin_notes: string | null;
	declare created_at: Date;
	declare resolved_at: Date | null;
	declare resolved_by: string | null;

	static initModel(sequelize: Sequelize) {
		DataChangeRequestModel.init({
			id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			requester_netid: { type: DataTypes.STRING, allowNull: false },
			target_netid: { type: DataTypes.STRING, allowNull: false },
			status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
			requested_changes: { type: DataTypes.JSONB, allowNull: false },
			admin_notes: { type: DataTypes.TEXT },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
			resolved_at: { type: DataTypes.DATE },
			resolved_by: { type: DataTypes.STRING },
		}, {
			sequelize,
			tableName: "data_change_request",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	toSanitizedObject() {
		return {
			id: this.id,
			requester_netid: this.requester_netid,
			target_netid: this.target_netid,
			status: this.status,
			requested_changes: this.requested_changes,
			...this.admin_notes != null && { admin_notes: this.admin_notes },
			created_at: this.created_at,
			...this.resolved_at != null && { resolved_at: this.resolved_at },
			...this.resolved_by != null && { resolved_by: this.resolved_by },
		};
	}
}
