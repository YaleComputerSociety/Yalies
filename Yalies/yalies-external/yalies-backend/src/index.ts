import {configDotenv} from "dotenv";
import path from "path";
import WebServer from "./helpers/webServer.js";
import CAS from "./helpers/cas.js";
import DB from "./helpers/db.js";
import Elasticsearch from "./helpers/elasticsearch.js";
import { isMockDirectoryEnabled } from "./helpers/mockDirectory.js";

if (process.env.NODE_ENV === "development") {
	const configDir = path.resolve(process.cwd(), "../../../.config/external");
	configDotenv({ path: path.join(configDir, ".env.backend.development"), override: true });
}

if(process.env.NODE_ENV === "development") console.log("******\nRunning in development mode.\n******\n\n");

process.env.PORT ||= "8000";

if (isMockDirectoryEnabled()) {
	new WebServer();
} else {
	new CAS();
	const db = new DB();
	const elasticsearch = new Elasticsearch();
	new WebServer(db, elasticsearch);
}
