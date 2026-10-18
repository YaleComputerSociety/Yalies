import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2]);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const random = () => randomBytes(32).toString('base64url');
const ensure = (name, create) => {
  const path = resolve(directory, name);
  if (!existsSync(path)) writeFileSync(path, create(), { mode: 0o600, flag: 'wx' });
};
if (process.argv[3] !== 'render-env') {
  ensure('oidc-jwks.json', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
    return JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), kid: randomUUID(), use: 'sig', alg: 'RS256' }] });
  });
  ensure('oidc-subject-secret', random);
  ensure('oidc-cookie-keys.json', () => JSON.stringify([random()]));
  ensure('yuttler-client-secret', random);
  ensure('yuttler-session-secret', random);
} else {
  const secret = name => readFileSync(resolve(directory, name), 'utf8').trim();
  writeFileSync(resolve(directory, '../yuttler-render.env'), [
    'NODE_ENV=production', 'YALIES_AUTH_ENABLED=true',
    'YALIES_ISSUER=https://api.yalies.io', 'YALIES_CLIENT_ID=yuttler',
    `YALIES_CLIENT_SECRET=${secret('yuttler-client-secret')}`,
    'YALIES_REDIRECT_URI=https://yuttler.com/auth/yalies/callback',
    'YUTTLER_FRONTEND_ORIGIN=https://yuttler.com',
    `YUTTLER_SESSION_SECRET=${secret('yuttler-session-secret')}`, '',
  ].join('\n'), { mode: 0o600 });
}
