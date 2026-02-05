import { serve } from "@hono/node-server";
import { env } from "@ycs/config";
import { createLogger } from "@ycs/logger";
import { app } from "./app.js";

const logger = createLogger("api-gateway");

serve({ fetch: app.fetch, port: env.PORT });

logger.info("API gateway started", { port: env.PORT });
