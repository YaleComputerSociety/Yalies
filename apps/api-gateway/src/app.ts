import { Hono } from "hono";
import { cors } from "@hono/cors";
import crypto from "node:crypto";
import { requestLogger } from "./middleware/logger.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { courseRoutes } from "./routes/courses.js";
import { worksheetRoutes } from "./routes/worksheets.js";
import { userRoutes } from "./routes/users.js";
import { scraperRoutes } from "./routes/scraper.js";

export const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
});

app.use("*", requestLogger);

app.route("/health", healthRoutes);
app.route("/api/v1/courses", courseRoutes);

app.use("/api/v1/worksheets/*", requireAuth);
app.route("/api/v1/worksheets", worksheetRoutes);

app.use("/api/v1/users/*", requireAuth);
app.route("/api/v1/users", userRoutes);

app.use("/api/v1/scraper/*", requireAuth);
app.use("/api/v1/scraper/jobs/*", requireAdmin);
app.route("/api/v1/scraper", scraperRoutes);
