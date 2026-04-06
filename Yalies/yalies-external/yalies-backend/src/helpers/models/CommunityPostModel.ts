import { DataTypes, Model, Sequelize } from "sequelize";
import { SEQUELIZE_DEFINITION_OPTIONS } from "../db.js";

export default class CommunityPostModel extends Model {
	declare id: number;
	declare author_netid: string;
	declare type: "team" | "recruiting" | "showcase";
	declare title: string;
	declare description: string;
	declare tags: string[];
	declare category: string;
	declare competition_name: string;
	declare competition_date: string;
	declare competition_url: string;
	declare spots_total: number;
	declare status: "open" | "closed" | "archived";
	declare created_at: Date;
	declare updated_at: Date;

	static initModel(sequelize: Sequelize) {
		CommunityPostModel.init({
			id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			author_netid: { type: DataTypes.STRING, allowNull: false },
			type: { type: DataTypes.STRING, allowNull: false },
			title: { type: DataTypes.STRING, allowNull: false },
			description: { type: DataTypes.TEXT },
			tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
			category: { type: DataTypes.STRING, allowNull: false },
			competition_name: { type: DataTypes.STRING },
			competition_date: { type: DataTypes.DATEONLY },
			competition_url: { type: DataTypes.STRING },
			spots_total: { type: DataTypes.INTEGER },
			status: { type: DataTypes.STRING, defaultValue: "open" },
			created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
			updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
		}, {
			sequelize,
			tableName: "community_post",
			...SEQUELIZE_DEFINITION_OPTIONS,
		});
	}

	toSanitizedObject() {
		return {
			id: this.id,
			author_netid: this.author_netid,
			type: this.type,
			title: this.title,
			description: this.description,
			tags: this.tags || [],
			category: this.category,
			status: this.status,
			created_at: this.created_at,
			updated_at: this.updated_at,
			...this.competition_name != null && { competition_name: this.competition_name },
			...this.competition_date != null && { competition_date: this.competition_date },
			...this.competition_url != null && { competition_url: this.competition_url },
			...this.spots_total != null && { spots_total: this.spots_total },
		};
	}
}
