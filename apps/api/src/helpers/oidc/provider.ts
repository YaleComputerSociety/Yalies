import { generateKeyPairSync, timingSafeEqual } from "node:crypto";
import express, { Express, Request, Response } from "express";
import Provider, { interactionPolicy, type Configuration } from "oidc-provider";
import { Sequelize, fn, col } from "sequelize";
import { API_ROUTES } from "yalies-shared";
import PersonModel from "../models/PersonModel.js";
import { RequestUser } from "../types.js";
import { approvedClient, initializeOidcModels, SequelizeOidcAdapter } from "./store.js";
import { opaqueSubject, profileClaims, randomToken, validInteractionId, verifySecret } from "./security.js";
import "./continuation.js";

export const isOidcPath = (path: string) => /^\/oauth(?:\/|$)|^\/\.well-known\//i.test(path);
export const isOidcProtocolPath = (path: string) => isOidcPath(path) && !path.toLowerCase().startsWith("/oauth/interaction/");

function configuration() {
	const development = process.env.NODE_ENV === "development";
	const issuer = process.env.OIDC_ISSUER;
	const frontend = process.env.FRONTEND_URL;
	if(!issuer || !frontend) throw new Error("OIDC_ISSUER and FRONTEND_URL are required");
	for(const value of [issuer, frontend]) {
		const url = new URL(value);
		if(url.origin !== value) throw new Error("OIDC issuer and frontend must be canonical origins without trailing slashes");
		if(url.protocol !== "https:" && !(development && url.protocol === "http:" && url.hostname === "localhost")) throw new Error("OIDC requires HTTPS outside localhost development");
	}
	if(!development && process.env.AUTH_MODE === "dev") throw new Error("OIDC cannot use development login in production");
	const subjectSecret = process.env.OIDC_SUBJECT_SECRET;
	const cookieKeys: string[] = JSON.parse(process.env.OIDC_COOKIE_KEYS || "[]");
	if(!subjectSecret || subjectSecret.length < 32 || !Array.isArray(cookieKeys) || !cookieKeys.length || cookieKeys.some(k => typeof k !== "string" || k.length < 32)) throw new Error("OIDC requires persistent subject and cookie secrets (at least 32 characters)");
	let jwks: Configuration["jwks"];
	if(process.env.OIDC_JWKS) {
		jwks = JSON.parse(process.env.OIDC_JWKS);
		if(!jwks.keys?.some(key => key.kty === "RSA" && "d" in key && key.d && key.kid)) throw new Error("OIDC_JWKS must contain a private RSA signing key with kid");
	} else if(development) {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		jwks = { keys: [{ ...privateKey.export({ format: "jwk" }), kid: "local-development", use: "sig", alg: "RS256" }] };
		console.warn("[OIDC] Ephemeral local signing key; restarting invalidates local ID tokens");
	} else throw new Error("OIDC_JWKS is required in production");
	return { issuer, frontend, subjectSecret, cookieKeys, jwks, development };
}

export function createOidcProvider(sql: Sequelize) {
	const config = configuration();
	initializeOidcModels(sql);
	const policy = interactionPolicy.base();
	// Every authorization must re-check the Yalies session and explicitly connect.
	policy.get("login").checks.add(new interactionPolicy.Check("yalies_session", "Yalies session required", ctx => !ctx.oidc.result?.login));
	policy.get("consent").checks.add(new interactionPolicy.Check("yalies_consent", "Confirm connection", ctx => !ctx.oidc.result?.consent));
	const provider = new Provider(config.issuer, {
		adapter: SequelizeOidcAdapter,
		jwks: config.jwks,
		cookies: {
			keys: config.cookieKeys,
			names: { session: "yalies_oidc", interaction: "yalies_interaction", resume: "yalies_resume" },
			long: { httpOnly: true, secure: !config.development, sameSite: "lax" },
			short: { httpOnly: true, secure: !config.development, sameSite: config.development ? "lax" : "none" },
		},
		clients: [],
		responseTypes: ["code"],
		clientAuthMethods: ["client_secret_basic", "none"],
		subjectTypes: ["pairwise"],
		scopes: ["openid", "profile"],
		claims: { openid: ["sub"], profile: ["name"] },
		conformIdTokenClaims: false,
		pkce: { required: () => true },
		clockTolerance: 0,
		ttl: { AuthorizationCode: 60, AccessToken: 300, IdToken: 300, Interaction: 600, Grant: 600, Session: 3600 },
		features: {
			devInteractions: { enabled: false },
			registration: { enabled: false },
			dPoP: { enabled: false },
			pushedAuthorizationRequests: { enabled: false },
			resourceIndicators: { enabled: false },
			rpInitiatedLogout: { enabled: false },
			userinfo: { enabled: true },
		},
		routes: { authorization: "/oauth/authorize", token: "/oauth/token", jwks: "/oauth/jwks", userinfo: "/oauth/userinfo" },
		interactions: { policy, url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}` },
		pairwiseIdentifier: (_ctx, accountId, client) => opaqueSubject(config.subjectSecret, accountId, client.clientId),
		findAccount: async (_ctx, netid) => {
			const person = await directoryPerson(netid);
			if(!person) return undefined;
			return { accountId: netid, claims: async (_use, scope) => ({ sub: netid, ...profileClaims(person, scope) }) };
		},
		clientBasedCORS: () => false,
		renderError: async ctx => {
			ctx.type = "html";
			ctx.body = "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width\"><title>Unable to connect · Yalies</title><body style=\"font:16px system-ui;color:#00356b;padding:32px\"><h1>Unable to connect</h1><p>This request is invalid or has expired. Close this window and try Continue with Yalies again.</p></body></html>";
		},
	});
	provider.proxy = true;
	// The library's async comparison hook retains standard client_secret_basic wire behavior.
	// This is intentionally version-pinned and covered by token-endpoint tests.
	provider.Client.prototype.compareClientSecret = async function(actual: string) {
		const client = await approvedClient(this.clientId);
		return !!client?.confidential && await verifySecret(actual, client.secret_hash);
	};
	provider.on("server_error", () => console.error("[OIDC] Provider request failed"));
	return { provider, config };
}

async function directoryPerson(netid: string) {
	return PersonModel.findOne({
		attributes: ["netid", "first_name", "preferred_name", "last_name", "school"],
		where: Sequelize.where(fn("LOWER", col("netid")), netid.toLowerCase()),
	});
}

function sessionNetid(req: Request) {
	return req.isAuthenticated() ? (req.user as RequestUser)?.netId?.toLowerCase() : undefined;
}

export function mountOidc(app: Express, sql: Sequelize) {
	if(process.env.OIDC_ENABLED !== "true") return;
	const { provider, config } = createOidcProvider(sql);
	const router = express.Router();
	const errorPage = (res: Response, error: string) => res.redirect(`${config.frontend}/connect?error=${error}`);
	const save = (req: Request) => new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
	const details = async (req: Request, res: Response) => {
		if(!validInteractionId(req.params.uid)) throw new Error("Invalid interaction");
		const interaction = await provider.interactionDetails(req, res);
		if(interaction.uid !== req.params.uid) throw new Error("Interaction mismatch");
		const client = await approvedClient(String(interaction.params.client_id));
		if(!client) throw new Error("Client unavailable");
		return { interaction, client };
	};
	router.use((req, res, next) => {
		res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'none'" });
		if(!config.development && !req.secure) return res.status(400).send("HTTPS required");
		const origin = req.get("origin");
		if(origin === config.frontend) {
			res.set({ "Access-Control-Allow-Origin": config.frontend, "Access-Control-Allow-Credentials": "true" });
			res.vary("Origin");
		}
		if(req.method === "OPTIONS") return res.status(origin === config.frontend ? 204 : 403).end();
		next();
	});
	router.get("/:uid", async (req, res) => {
		try {
			const { interaction } = await details(req, res);
			if(!sessionNetid(req)) {
				req.session.oidcContinuation = { uid: interaction.uid, expires: Date.now() + 600000 };
				await save(req);
				return res.redirect(API_ROUTES.login);
			}
			return res.redirect(`${config.frontend}/connect?interaction=${interaction.uid}`);
		} catch { return errorPage(res, "expired"); }
	});
	router.get("/:uid/details", async (req, res) => {
		try {
			const { interaction, client } = await details(req, res);
			const netid = sessionNetid(req);
			if(!netid) return res.status(401).json({ error: "signed_out" });
			const person = await directoryPerson(netid);
			if(!person) return res.status(403).json({ error: "access_denied" });
			const pending = req.session.oidcConsent || {};
			for(const [uid, entry] of Object.entries(pending)) if(entry.expires <= Date.now()) delete pending[uid];
			if(Object.keys(pending).length >= 10) delete pending[Object.keys(pending)[0]];
			const csrf = randomToken();
			pending[interaction.uid] = { csrf, netid, expires: Date.now() + 600000 };
			req.session.oidcConsent = pending;
			await save(req);
			return res.json({
				client: { name: client.display_name, logo: client.logo_uri },
				person: { name: profileClaims(person, "profile").name, school: person.school },
				permissions: ["Your Yalies identity", ...(String(interaction.params.scope).split(" ").includes("profile") ? ["Your name"] : [])],
				csrf,
			});
		} catch { return res.status(410).json({ error: "expired" }); }
	});
	router.post("/:uid", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
		try {
			if(req.get("origin") !== config.frontend) return errorPage(res, "invalid");
			const { interaction, client } = await details(req, res);
			const pending = req.session.oidcConsent?.[interaction.uid];
			const netid = sessionNetid(req);
			const csrf = req.body.csrf;
			if(!pending || !netid || pending.netid !== netid || pending.expires <= Date.now() || typeof csrf !== "string" || csrf.length !== pending.csrf.length || !timingSafeEqual(Buffer.from(csrf), Buffer.from(pending.csrf))) return errorPage(res, "expired");
			if(!["continue", "cancel"].includes(req.body.action)) return errorPage(res, "invalid");
			delete req.session.oidcConsent[interaction.uid];
			await save(req);
			if(req.body.action === "cancel") return await provider.interactionFinished(req, res, { error: "access_denied", error_description: "The user cancelled the connection" }, { mergeWithLastSubmission: false });
			if(!await directoryPerson(netid)) return errorPage(res, "access_denied");
			const grant = new provider.Grant({ accountId: netid, clientId: client.client_id });
			const scopes = String(interaction.params.scope).split(" ").filter(scope => client.scopes.includes(scope));
			grant.addOIDCScope(scopes.join(" "));
			const grantId = await grant.save();
			return await provider.interactionFinished(req, res, { login: { accountId: netid, remember: false }, consent: { grantId } }, { mergeWithLastSubmission: false });
		} catch { return errorPage(res, "server"); }
	});
	app.use("/oauth/interaction", router);
	app.use((req, res, next) => {
		if(!isOidcPath(req.path)) return next();
		res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "frame-ancestors 'none'" });
		if(!config.development && !req.secure) return res.status(400).json({ error: "invalid_request" });
		if(req.path.toLowerCase().replace(/\/$/, "") === "/oauth/authorize") {
			if(req.method !== "GET") return res.status(405).set("Allow", "GET").json({ error: "invalid_request" });
			// V1 relies on the existing Yalies login; it does not promise CAS credential freshness.
			if(req.query.max_age !== undefined || String(req.query.prompt || "").split(" ").includes("login")) return res.status(400).json({ error: "invalid_request", error_description: "Forced reauthentication is not supported" });
			if([req.query.state, req.query.nonce].some(value => typeof value !== "string" || !value.length || value.length > 1024)) return res.status(400).json({ error: "invalid_request", error_description: "state and nonce are required" });
			if(typeof req.query.scope !== "string" || !req.query.scope.split(" ").includes("openid")) return res.status(400).json({ error: "invalid_scope" });
		}
		return provider.callback()(req, res);
	});
	return provider;
}
