import { fileURLToPath } from "node:url";
import {configDotenv} from "dotenv";
import path from "path";
import WebServer from "./helpers/webServer.js";
import CAS from "./helpers/cas.js";
import DB from "./helpers/db.js";

if (process.env.NODE_ENV === "development") {
	const configDir = fileURLToPath(new URL("../../../.config/external", import.meta.url));
	configDotenv({ path: path.join(configDir, ".env.backend.development"), override: true });
}

if(process.env.NODE_ENV === "development") console.log("******\nRunning in development mode.\n******\n\n");

new CAS();
const db = new DB();
new WebServer(db);
