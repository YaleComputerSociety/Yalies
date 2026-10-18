import { DataTypes, Model, Op, Sequelize } from "sequelize";
import { errors, type AdapterPayload } from "oidc-provider";
import { validateRedirect } from "./security.js";

export class OAuthClient extends Model {
	declare client_id: string;
	declare display_name: string;
	declare logo_uri: string | null;
	declare redirect_uris: string[];
	declare scopes: string[];
	declare active: boolean;
	declare development: boolean;
	declare secret_hash: string | null;
	declare confidential: boolean;
}

export class OAuthArtifact extends Model {
	declare kind: string;
	declare id: string;
	declare payload: AdapterPayload;
	declare consumed_at: Date | null;
}

export function initializeOidcModels(sql: Sequelize) {
	OAuthClient.init({
		client_id: { type: DataTypes.STRING, primaryKey: true },
		display_name: { type: DataTypes.STRING, allowNull: false },
		logo_uri: DataTypes.TEXT,
		redirect_uris: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
		scopes: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
		active: { type: DataTypes.BOOLEAN, allowNull: false },
		development: { type: DataTypes.BOOLEAN, allowNull: false },
		confidential: { type: DataTypes.BOOLEAN, allowNull: false },
		secret_hash: DataTypes.TEXT,
	}, { sequelize: sql, tableName: "oauth_client", createdAt: "created_at", updatedAt: "updated_at" });
	OAuthArtifact.init({
		kind: { type: DataTypes.STRING, primaryKey: true },
		id: { type: DataTypes.STRING, primaryKey: true },
		payload: { type: DataTypes.JSONB, allowNull: false },
		expires_at: { type: DataTypes.DATE, allowNull: false },
		consumed_at: DataTypes.DATE,
		grant_id: DataTypes.STRING,
		uid: DataTypes.STRING,
		user_code: DataTypes.STRING,
	}, { sequelize: sql, tableName: "oauth_artifact", timestamps: false });
}

export async function approvedClient(id: string) {
	const client = await OAuthClient.findByPk(id);
	if(!client?.active || (process.env.NODE_ENV !== "development" && client.development)) return undefined;
	if(!client.scopes.includes("openid") || client.scopes.some(s => !["openid", "profile"].includes(s))) return undefined;
	if(!client.redirect_uris.length || (client.confidential && !client.secret_hash)) return undefined;
	try {
		client.redirect_uris.forEach(uri => validateRedirect(uri, client.development));
		if(client.logo_uri && new URL(client.logo_uri).protocol !== "https:") return undefined;
	} catch { return undefined; }
	return client;
}

export class SequelizeOidcAdapter {
	constructor(private kind: string) {}
	async upsert(id: string, payload: AdapterPayload, expiresIn = 3600) {
		// Preserve consumed_at on conflict: saving a stale object must never resurrect a code.
		await OAuthArtifact.sequelize.query(`INSERT INTO oauth_artifact
			(kind, id, payload, expires_at, grant_id, uid, user_code)
			VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
			ON CONFLICT (kind, id) DO UPDATE SET payload = EXCLUDED.payload,
			expires_at = EXCLUDED.expires_at, grant_id = EXCLUDED.grant_id,
			uid = EXCLUDED.uid, user_code = EXCLUDED.user_code`, {
			bind: [this.kind, id, JSON.stringify(payload), new Date(Date.now() + expiresIn * 1000), payload.grantId || null, payload.uid || null, payload.userCode || null],
		});
	}
	async find(id: string) {
		if(this.kind === "Client") {
			const client = await approvedClient(id);
			if(!client) return undefined;
			return {
				client_id: client.client_id, client_name: client.display_name,
				redirect_uris: client.redirect_uris, scope: client.scopes.join(" "),
				response_modes: ["query"], response_types: ["code"], grant_types: ["authorization_code"],
				subject_type: "pairwise", application_type: "web",
				token_endpoint_auth_method: client.confidential ? "client_secret_basic" : "none",
				// The provider's comparison hook verifies this encoded hash, never the raw value.
				...(client.confidential ? { client_secret: client.secret_hash } : {}),
			} as AdapterPayload;
		}
		return this.lookup({ id });
	}
	private async lookup(where: Record<string, string>) {
		const row = await OAuthArtifact.findOne({ where: { ...where, kind: this.kind, expires_at: { [Op.gt]: new Date() } } });
		if(!row) return undefined;
		return { ...row.payload, ...(row.consumed_at ? { consumed: Math.floor(row.consumed_at.getTime() / 1000) } : {}) };
	}
	async findByUid(uid: string) { return this.lookup({ uid }); }
	async findByUserCode(user_code: string) { return this.lookup({ user_code }); }
	async destroy(id: string) { await OAuthArtifact.destroy({ where: { kind: this.kind, id } }); }
	async revokeByGrantId(grant_id: string) { await OAuthArtifact.destroy({ where: { grant_id } }); }
	async consume(id: string) {
		const [count] = await OAuthArtifact.update({ consumed_at: new Date() }, {
			where: { kind: this.kind, id, consumed_at: null, expires_at: { [Op.gt]: new Date() } },
		});
		// Atomic conditional update protects concurrent exchanges across Cloud Run instances.
		if(count !== 1) throw new errors.InvalidGrant("Authorization is expired or already used");
	}
}
