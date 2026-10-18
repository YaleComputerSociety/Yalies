import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const randomToken = () => randomBytes(32).toString("base64url");
export const validInteractionId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(id);

export async function hashSecret(secret: string) {
	const salt = randomToken();
	const hash = await scrypt(secret, salt, 64) as Buffer;
	return `scrypt:${salt}:${hash.toString("hex")}`;
}

export async function verifySecret(secret: string, encoded: string) {
	if(typeof secret !== "string" || secret.length > 1024) return false;
	const [algorithm, salt, hash] = encoded.split(":");
	if(algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/.test(hash || "")) return false;
	const actual = await scrypt(secret, salt, 64) as Buffer;
	return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

export function opaqueSubject(secret: string, netid: string, clientId: string) {
	return createHmac("sha256", secret).update(JSON.stringify(["yalies-sub-v1", clientId, netid.toLowerCase()])).digest("base64url");
}

export function validateRedirect(uri: string, development: boolean) {
	const url = new URL(uri);
	if(url.username || url.password || url.hash || uri.includes("*") || url.href !== uri) throw new Error("Use an exact, canonical redirect URI without credentials, fragments or wildcards");
	if(url.protocol !== "https:" && !(development && url.protocol === "http:" && url.hostname === "localhost")) throw new Error("Redirect URIs require HTTPS (explicit development clients may use http://localhost)");
}

export function profileClaims(person: { first_name: string; preferred_name?: string; last_name: string }, scope: string) {
	return scope.split(" ").includes("profile") ? { name: [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(" ") } : {};
}
