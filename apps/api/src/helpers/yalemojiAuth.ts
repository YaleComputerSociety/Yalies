import { createHmac } from "node:crypto";

export const YALEMOJI_ASSERTION_TTL_SECONDS = 60;
export const YALEMOJI_STATE_MAX_LENGTH = 512;

export type YaleMojiAuthError =
	| "invalid_state"
	| "configuration_error"
	| "authentication_failed"
	| "identity_unavailable"
	| "session_failed";

export type YaleMojiAuthAssertionPayload = {
	v: 1;
	iss: "yalies";
	aud: "yalemoji";
	netid: string;
	iat: number;
	exp: number;
	state: string;
};

export const isValidYaleMojiState = (state: unknown): state is string => {
	return typeof state === "string"
		&& state.length > 0
		&& state.length <= YALEMOJI_STATE_MAX_LENGTH
		&& /^[A-Za-z0-9._~-]+$/.test(state);
};

export const createSignedAuthAssertion = (
	netid: string,
	state: string,
	secret: string,
	now = Math.floor(Date.now() / 1000),
) => {
	const normalizedNetid = netid.trim().toLowerCase();
	if(!normalizedNetid) throw new Error("Cannot sign an assertion without a NetID");
	if(!isValidYaleMojiState(state)) throw new Error("Cannot sign an assertion with invalid state");
	if(!secret) throw new Error("Cannot sign an assertion without a secret");

	const payload: YaleMojiAuthAssertionPayload = {
		v: 1,
		iss: "yalies",
		aud: "yalemoji",
		netid: normalizedNetid,
		iat: now,
		exp: now + YALEMOJI_ASSERTION_TTL_SECONDS,
		state,
	};
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = createHmac("sha256", secret)
		.update(encodedPayload)
		.digest("base64url");

	return `${encodedPayload}.${signature}`;
};
