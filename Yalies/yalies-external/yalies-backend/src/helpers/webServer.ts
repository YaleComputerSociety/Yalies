import express, { Express } from "express";
import compression from "compression";
import PingPongRouter from "./routes/pingPongRouter.js";
import PeopleRouter from "./routes/peopleRouter.js";
import CasRouter from "./routes/casRouter.js";
import CAS from "./cas.js";
import DevLoginRouter from "./routes/devLoginRouter.js";
import passport from "passport";
import session from "express-session";
import cors from "cors";
import FiltersRouter from "./routes/filtersRouter.js";
import DB from "./db.js";
import ConnectSessionSequelize from "connect-session-sequelize";
import APIKeyRouter from "./routes/apiKeyRouter.js";
import UserProfileRouter from "./routes/userProfileRouter.js";
import ProfileLikeRouter from "./routes/profileLikeRouter.js";
import FriendshipRouter from "./routes/friendshipRouter.js";

import CommunityPostsRouter from "./routes/communityPostsRouter.js";
import Elasticsearch from "./elasticsearch.js";
import { API_ROUTES } from "yalies-shared";
import { isFacecheckEnabled, setFacecheckEnabled } from "./facecheck.js";
import {
	getMockFriendStatus,
	getMockLikes,
	getMockPerson,
	getMockProfile,
	isMockDirectoryEnabled,
	MOCK_DIRECTORY_NETID,
} from "./mockDirectory.js";

const SequelizeStore = ConnectSessionSequelize(session.Store);

export default class WebServer {
	#app: Express;
	#db?: DB;
	#elasticsearch?: Elasticsearch;

	constructor(db?: DB, elasticsearch?: Elasticsearch) {
		this.#db = db;
		this.#elasticsearch = elasticsearch;
		this.initializeExpress();
		this.initializeSubRouters();
		this.serve();
	}

	initializeExpress = () => {
		this.#app = express();
		this.#app.set("trust proxy", 1);
		this.#app.use(compression());
		this.#app.use(cors({ credentials: true, origin: true }));
		this.#app.use(express.json());
		this.#app.use(express.urlencoded({ extended: true }));
		this.#app.use((req, res, next) => {

			res.set("Cache-Control", "no-store");
			next();
		});

		if (isMockDirectoryEnabled()) {
			return;
		}

		this.#app.use(session({
			secret: process.env.SESSION_SECRET,
			resave: false,
			saveUninitialized: false,
			cookie: { 
				httpOnly: true,

				secure: process.env.NODE_ENV !== "development",

				sameSite: process.env.NODE_ENV !== "development" ? "none" : false,

				maxAge: 34560000 * 1000,
			},
			store: this.createSessionStore(),
		}));
		this.#app.use(passport.initialize());
		this.#app.use(passport.session());
	};

	createSessionStore = () => {
		const store = new SequelizeStore({
			db: this.#db!.getSql(),
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
		this.#app.use(API_ROUTES.ping, pingPongRouter.getRouter());

		const peopleRouter = new PeopleRouter(this.#elasticsearch);
		this.#app.use(API_ROUTES.people, peopleRouter.getRouter());
		this.#app.use("/v2/people", peopleRouter.getRouter());

		if (isMockDirectoryEnabled()) {
			console.log("[Directory] Using mock seed data; database, CAS, and Elasticsearch are bypassed.");

			const filtersRouter = new FiltersRouter();
			this.#app.use(API_ROUTES.filters, filtersRouter.getRouter());
			this.#app.use("/v2/filters", filtersRouter.getRouter());

			this.#app.get(API_ROUTES.login, (_req, res) => {
				res.redirect(process.env.FRONTEND_URL || "/");
			});
			this.#app.get(`${API_ROUTES.login}/logout`, (_req, res) => {
				res.redirect(process.env.FRONTEND_URL || "/");
			});
			this.#app.get(`${API_ROUTES.profile}/me`, (_req, res) => {
				res.json(getMockProfile(MOCK_DIRECTORY_NETID));
			});
			this.#app.get(`${API_ROUTES.profile}/me/full`, (_req, res) => {
				res.json({
					profile: getMockProfile(MOCK_DIRECTORY_NETID),
					person: getMockPerson(MOCK_DIRECTORY_NETID),
				});
			});
			this.#app.get(`${API_ROUTES.profile}/:netid`, (req, res) => {
				res.json(getMockProfile(req.params.netid));
			});
			this.#app.get(`${API_ROUTES.likes}/:netid`, (req, res) => {
				res.json(getMockLikes(req.params.netid));
			});
			this.#app.post(`${API_ROUTES.likes}/:netid`, (req, res) => {
				const likes = getMockLikes(req.params.netid);
				res.json({ count: likes.liked ? likes.count : likes.count + 1, liked: true });
			});
			this.#app.delete(`${API_ROUTES.likes}/:netid`, (req, res) => {
				const likes = getMockLikes(req.params.netid);
				res.json({ count: likes.liked ? Math.max(likes.count - 1, 0) : likes.count, liked: false });
			});
			this.#app.get(`${API_ROUTES.friends}/status/:netid`, (req, res) => {
				res.json(getMockFriendStatus(req.params.netid));
			});
			this.#app.get(`${API_ROUTES.friends}/count/:netid`, (req, res) => {
				res.json({ count: getMockFriendStatus(req.params.netid).count });
			});
			this.#app.get(`${API_ROUTES.friends}/me`, (_req, res) => {
				res.json({ friends: ["demo2", "demo5", "demo9"] });
			});
			this.#app.get(`${API_ROUTES.friends}/requests`, (_req, res) => {
				res.json({ requests: ["demo7"] });
			});
			this.#app.post(`${API_ROUTES.friends}/request/:netid`, (req, res) => {
				res.json({ status: "pending_sent", count: getMockFriendStatus(req.params.netid).count });
			});
			this.#app.post(`${API_ROUTES.friends}/accept/:netid`, (req, res) => {
				res.json({ status: "accepted", count: getMockFriendStatus(req.params.netid).count + 1 });
			});
			this.#app.post(`${API_ROUTES.friends}/decline/:netid`, (req, res) => {
				res.json({ status: "none", count: getMockFriendStatus(req.params.netid).count });
			});
			this.#app.delete(`${API_ROUTES.friends}/:netid`, (req, res) => {
				res.json({ status: "none", count: Math.max(getMockFriendStatus(req.params.netid).count - 1, 0) });
			});
			this.#app.post(`${API_ROUTES.community}/search`, (_req, res) => {
				res.json([]);
			});
			this.#app.get(`${API_ROUTES.community}/mine`, (_req, res) => {
				res.json([]);
			});

			this.addRootRoute();
			return;
		}

		if(process.env.AUTH_MODE === "dev") {
			console.log("[Auth] Using dev login bypass (AUTH_MODE=dev)");
			const devLoginRouter = new DevLoginRouter();
			this.#app.use(API_ROUTES.login, devLoginRouter.getRouter());
		} else {
			console.log("[Auth] Using Yale CAS login (AUTH_MODE=cas)");
			const casRouter = new CasRouter();
			this.#app.use(API_ROUTES.login, casRouter.getRouter());
		}

		const filtersRouter = new FiltersRouter();
		const filtersCacheMiddleware = (req: any, res: any, next: any) => {
			res.set("Cache-Control", "public, max-age=300");
			next();
		};
		this.#app.use(API_ROUTES.filters, filtersCacheMiddleware, filtersRouter.getRouter());
		this.#app.use("/v2/filters", filtersCacheMiddleware, filtersRouter.getRouter());

		const apiKeyRouter = new APIKeyRouter();
		this.#app.use(API_ROUTES.apiKeys, apiKeyRouter.getRouter());

		const userProfileRouter = new UserProfileRouter();
		this.#app.use(API_ROUTES.profile, userProfileRouter.getRouter());

		const profileLikeRouter = new ProfileLikeRouter();
		this.#app.use(API_ROUTES.likes, profileLikeRouter.getRouter());

		const friendshipRouter = new FriendshipRouter();
		this.#app.use(API_ROUTES.friends, friendshipRouter.getRouter());

		const communityPostsRouter = new CommunityPostsRouter();
		this.#app.use(API_ROUTES.community, communityPostsRouter.getRouter());

		this.#app.get(`${API_ROUTES.admin}/facecheck`, CAS.requireAuthentication, (_req, res) => {
			res.json({ enabled: isFacecheckEnabled() });
		});
		this.#app.put(`${API_ROUTES.admin}/facecheck`, CAS.requireAuthentication, (req, res) => {
			const { enabled } = req.body;
			if (typeof enabled !== "boolean") {
				return res.status(400).json({ error: "enabled must be a boolean" });
			}
			setFacecheckEnabled(enabled);
			res.json({ enabled: isFacecheckEnabled() });
		});

		this.addRootRoute();
	};

	addRootRoute = () => {
		this.#app.get("/", (_req, res) => {
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
