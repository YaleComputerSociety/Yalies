import { readFile } from 'node:fs/promises';
import { Sequelize } from 'sequelize';
import { initializeOidcModels, OAuthClient } from '../build/helpers/oidc/store.js';
import { hashSecret, verifySecret, validateRedirect } from '../build/helpers/oidc/security.js';

// Explicit deployment step, never application startup. Do not log DB errors/credentials.
const callback = 'https://yuttler.com/auth/yalies/callback';
const secret = (await readFile(`${process.env.OIDC_PROVISION_DIR}/yuttler-client-secret`, 'utf8')).trim();
if (secret.length < 32 || !process.env.DATABASE_URL) throw new Error('Production database and client secret are required');
validateRedirect(callback, false);
const sql = new Sequelize(process.env.DATABASE_URL, { logging: false });
try {
  const [[tables]] = await sql.query("SELECT to_regclass('oauth_client') AS client, to_regclass('oauth_artifact') AS artifact");
  if (!tables.client && !tables.artifact) {
    await sql.query(await readFile(new URL('../migrations/20260923_continue_with_yalies.sql', import.meta.url), 'utf8'));
    console.log('Applied Continue with Yalies migration.');
  } else if (!tables.client || !tables.artifact) {
    throw new Error('Partial OAuth schema: inspect before proceeding');
  }
  initializeOidcModels(sql);
  const existing = await OAuthClient.findByPk('yuttler');
  if (existing) {
    if (!existing.active || existing.development || !existing.confidential || !await verifySecret(secret, existing.secret_hash || '')) {
      throw new Error('Existing Yuttler registration differs; reconcile its secret/approval before deploying');
    }
    await existing.update({ redirect_uris: [...new Set([...existing.redirect_uris, callback])], development: false });
  } else {
    await OAuthClient.create({ client_id: 'yuttler', display_name: 'Yuttler', redirect_uris: [callback], scopes: ['openid', 'profile'], active: true, development: false, confidential: true, secret_hash: await hashSecret(secret) });
  }
  console.log(`Yuttler approved callback: ${callback}`);
} catch (error) {
  // Sequelize exceptions can contain connection or SQL parameters.
  console.error(error.name === 'Error' ? error.message : 'OIDC database provisioning failed; inspect the database without logging credentials.');
  process.exitCode = 1;
} finally { await sql.close(); }
