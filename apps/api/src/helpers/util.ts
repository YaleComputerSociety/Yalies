import crypto from "crypto";

export const generateApiKey = () =>
	crypto.randomBytes(40).toString("base64url");
