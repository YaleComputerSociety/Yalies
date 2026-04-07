import { configDotenv } from "dotenv";
import path from "path";
configDotenv({ path: path.resolve(process.cwd(), "../../../.config/internal/.env.data-pipeline"), override: true });

import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import ConnectSessionSequelize from "connect-session-sequelize";
import { Sequelize } from "sequelize";

import CookieRouter from "./routes/CookieRouter.js";
import ScrapeRouter from "./routes/ScrapeRouter.js";
import SyncRouter from "./routes/SyncRouter.js";
import DatabaseRouter from "./routes/DatabaseRouter.js";
import CasRouter from "./routes/CasRouter.js";
import DevLoginRouter from "./routes/DevLoginRouter.js";
import CAS from "./helpers/cas.js";
import { PIPELINE_ROUTES } from "yalies-shared";

import SessionModel from "./models/SessionModel.js";
import AdminModel from "./models/AdminModel.js";

const sequelize = new Sequelize(process.env.DATABASE_URL!, { logging: false });
SessionModel.initModel(sequelize);
AdminModel.initModel(sequelize);

if (process.env.AUTH_MODE !== "dev") {
	new CAS();
} else {

	passport.serializeUser((user: Express.User, done) => done(null, user));
	passport.deserializeUser((user: Express.User, done) => done(null, user as Express.User));
}

const SequelizeStore = ConnectSessionSequelize(session.Store);

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

app.set("trust proxy", 1);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
	res.set("Cache-Control", "no-store");
	next();
});

app.use(session({
	secret: process.env.SESSION_SECRET!,
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		secure: process.env.NODE_ENV !== "development",
		sameSite: process.env.NODE_ENV !== "development" ? "none" : false,
		maxAge: 34560000 * 1000,
	},
	store: new SequelizeStore({
		db: sequelize,
		table: "SessionModel",
		checkExpirationInterval: 15 * 60 * 1000,
		extendDefaultFields: (defaults, session) => {
			return {
				data: defaults.data,
				expires: defaults.expires,
				netid: session.netid,
			};
		},
	}),
}));
app.use(passport.initialize());
app.use(passport.session());

if (process.env.AUTH_MODE === "dev") {
	if (process.env.NODE_ENV !== "development") {
		console.error("FATAL: AUTH_MODE=dev is not allowed outside of development. Set AUTH_MODE=cas for production.");
		process.exit(1);
	}
	console.log("[Auth] Using dev login bypass (AUTH_MODE=dev)");
	const devLoginRouter = new DevLoginRouter();
	app.use(PIPELINE_ROUTES.auth, devLoginRouter.getRouter());
} else {
	console.log("[Auth] Using Yale CAS login (AUTH_MODE=cas)");
	const casRouter = new CasRouter();
	app.use(PIPELINE_ROUTES.auth, casRouter.getRouter());
}

app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

const cookieRouter = new CookieRouter();
const scrapeRouter = new ScrapeRouter();
const syncRouter = new SyncRouter();
const databaseRouter = new DatabaseRouter();

app.use(PIPELINE_ROUTES.cookie, CAS.requireAdmin, cookieRouter.getRouter());
app.use(PIPELINE_ROUTES.scrape, CAS.requireAdmin, scrapeRouter.getRouter());
app.use(PIPELINE_ROUTES.sync, CAS.requireAdmin, syncRouter.getRouter());
app.use(PIPELINE_ROUTES.database, CAS.requireAdmin, databaseRouter.getRouter());

async function initDb() {
	try {
		await sequelize.authenticate();
		console.log("Connected to the database");

		await sequelize.query(`
			CREATE TABLE IF NOT EXISTS admin (
				netid VARCHAR(255) PRIMARY KEY,
				added_at TIMESTAMP DEFAULT NOW()
			);
		`);
		await sequelize.query(`
			CREATE TABLE IF NOT EXISTS session (
				sid VARCHAR(255) PRIMARY KEY,
				netid VARCHAR(255),
				expires TIMESTAMP,
				data TEXT
			);
		`);

	} catch (error) {
		console.error("Database initialization error:", error);
	}
}

const start = async () => {
	await initDb();
	app.listen(PORT, () => {
		console.log(`Yalies scraper API server listening on port ${PORT}`);
	});
};
start();
