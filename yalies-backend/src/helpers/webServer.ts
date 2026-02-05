import express, { Express } from "express";
import PingPongRouter from "./routes/pingPongRouter.js";
import PeopleRouter from "./routes/peopleRouter.js";
import CasRouter from "./routes/casRouter.js";
import passport from "passport";
import session from "express-session";
import cors from "cors";
import FiltersRouter from "./routes/filtersRouter.js";
import DB from "./db.js";
import ConnectSessionSequelize from "connect-session-sequelize";
import APIKeyRouter from "./routes/apiKeyRouter.js";
import Elasticsearch from "./elasticsearch.js";

const SequelizeStore = ConnectSessionSequelize(session.Store);

export default class WebServer {
	#app: Express;
	#db: DB;
	#elasticsearch: Elasticsearch;

	constructor(db: DB, elasticsearch: Elasticsearch) {
		this.#db = db;
		this.#elasticsearch = elasticsearch;
		this.initializeExpress();
		this.initializeSubRouters();
		this.serve();
	}

	initializeExpress = () => {
		this.#app = express();
		this.#app.set("trust proxy", 1);
		this.#app.use(cors({ credentials: true, origin: true }));
		this.#app.use(express.json());
		this.#app.use(express.urlencoded({ extended: true }));
		this.#app.use((req, res, next) => {
			res.set("Cache-Control", "no-store");
			next();
		});
		
		this.#app.use(session({
			secret: process.env.SESSION_SECRET,
			resave: false,
			saveUninitialized: false,
			cookie: { 
				httpOnly: true,
				// Restrict to HTTPS only in prod
				secure: process.env.NODE_ENV !== "development",
				// TODO: THIS IS INSECURE DUE TO CSRF! Once we get domains, do Domain Relaxation
				sameSite: process.env.NODE_ENV !== "development" ? "none" : false,
				// 400 days, the max age that Chrome supports
				// Note that the cookie API uses secs, while express uses millis
				maxAge: 34560000 * 1000,
			},
			store: this.createSessionStore(),
		}));
		this.#app.use(passport.initialize());
		this.#app.use(passport.session());
	};

	createSessionStore = () => {
		const store = new SequelizeStore({
			db: this.#db.getSql(),
			table: "session",
			modelKey: "SessionModel",
			checkExpirationInterval: 15 * 60 * 1000,
			extendDefaultFields: (defaults, session) => {
				return {
					data: defaults.data,
					expires: defaults.expires,
					netid: session.netid,
				};
			},
		});
		return store;
	};

	initializeSubRouters = () => {
		const pingPongRouter = new PingPongRouter();
		this.#app.use("/v2/ping", pingPongRouter.getRouter());
		
		const peopleRouter = new PeopleRouter(this.#elasticsearch);
		this.#app.use("/v2/people", peopleRouter.getRouter());
		
		const casRouter = new CasRouter();
		this.#app.use("/v2/login", casRouter.getRouter());
		
		const filtersRouter = new FiltersRouter();
		this.#app.use("/v2/filters", filtersRouter.getRouter());

		const apiKeyRouter = new APIKeyRouter();
		this.#app.use("/v2/api-keys", apiKeyRouter.getRouter());

		this.#app.get("/", (req, res) => {
			res.status(200).send(
				"<html><body><pre>" +
				"__   __    _ _             _       <br />" +
				"\\ \\ / /_ _| (_) ___  ___  (_) ___  <br />" +
				" \\ V / _` | | |/ _ \\/ __| | |/ _ \\ <br />" +
				"  | | (_| | | |  __/\\__ \\_| | (_) |<br />" +
				"  |_|\\__,_|_|_|\\___||___(_)_|\\___/ <br />" +
				"								    <br />" +
				"</pre></body></html>",
			);
		});
	};

	serve = () => {
		this.#app.listen(process.env.PORT, () => {
			console.log(`App running on port ${process.env.PORT}`);
		});
	};
}
