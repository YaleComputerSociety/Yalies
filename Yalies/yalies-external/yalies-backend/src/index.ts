import {configDotenv} from "dotenv";
import path from "path";
import WebServer from "./helpers/webServer.js";
import CAS from "./helpers/cas.js";
import DB from "./helpers/db.js";
import Elasticsearch from "./helpers/elasticsearch.js";

const configDir = path.resolve(process.cwd(), "../../../.config/external");

configDotenv({
	path: process.env.NODE_ENV === "development"
		? path.join(configDir, ".env.backend.development")
		: path.join(configDir, ".env.backend.production"),
	override: true,
});

if(process.env.NODE_ENV === "development") console.log("******\nRunning in development mode.\n******\n\n");

new CAS();
const db = new DB();
const elasticsearch = new Elasticsearch();
new WebServer(db, elasticsearch);
