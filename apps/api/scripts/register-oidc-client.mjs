import { Sequelize } from "sequelize";
import { initializeOidcModels, OAuthClient } from "../build/helpers/oidc/store.js";
import { hashSecret, validateRedirect } from "../build/helpers/oidc/security.js";

// Run after the explicit SQL migration. Never print or accept secrets on the command line.
const development = process.argv.includes("--development");
const clientId = process.env.OIDC_CLIENT_ID || "yuttler";
const redirects = JSON.parse(process.env.OIDC_CLIENT_REDIRECT_URIS || (development ? '["http://localhost:3001/auth/yalies/callback"]' : "[]"));
if (!Array.isArray(redirects) || !redirects.length) throw new Error("Set OIDC_CLIENT_REDIRECT_URIS to a JSON array of exact callbacks");
redirects.forEach(uri => validateRedirect(uri, development));
const secret = process.env.OIDC_CLIENT_SECRET;
if (!secret || secret.length < 32) throw new Error("Set OIDC_CLIENT_SECRET to a random secret of at least 32 characters");
const logo = process.env.OIDC_CLIENT_LOGO_URI || null;
if (logo && new URL(logo).protocol !== "https:") throw new Error("Client logo must use HTTPS");
const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
try {
  initializeOidcModels(sql);
  const existing = await OAuthClient.findByPk(clientId);
  if (existing && !process.argv.includes("--replace")) throw new Error("Client exists. Use --replace explicitly to rotate its secret/update registration");
  await OAuthClient.upsert({
    client_id: clientId,
    display_name: process.env.OIDC_CLIENT_NAME || "Yuttler",
    logo_uri: logo,
    redirect_uris: redirects,
    scopes: ["openid", "profile"],
    active: true,
    confidential: true,
    development,
    secret_hash: await hashSecret(secret),
  });
  console.log(`Registered ${clientId}; secret is stored only as a scrypt hash.`);
} finally {
  await sql.close();
}
