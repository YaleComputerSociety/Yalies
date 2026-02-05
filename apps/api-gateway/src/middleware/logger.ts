import type { MiddlewareHandler } from "hono";
import { createLogger } from "@ycs/logger";

const logger = createLogger("api-gateway");

/**
 * Request logging middleware.
 */
export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  logger.info("request", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
    requestId: c.get("requestId")
  });
};
