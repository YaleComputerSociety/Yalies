import { Hono } from "hono";
import { z } from "zod";
import { SessionManager } from "@ycs/auth";
import { serviceClient } from "@ycs/db";
import {
  coursetableCatalogQueue,
  coursetableEvaluationsQueue,
  yaliesDirectoryQueue,
  yaleimsScoresQueue
} from "@ycs/queue";

export const scraperRoutes = new Hono();
const sessionManager = new SessionManager();

const jobQueueMap = {
  coursetableCatalog: coursetableCatalogQueue,
  coursetableEvaluations: coursetableEvaluationsQueue,
  yaliesDirectory: yaliesDirectoryQueue,
  yaleimsScores: yaleimsScoresQueue
};

scraperRoutes.post("/sessions/donate", async (c) => {
  const schema = z.object({
    cookies: z.unknown(),
    targetSystems: z.array(z.string()).min(1),
    expiresAt: z.string().min(1)
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const donorNetId = c.get("netId") as string;
  const sessionId = await sessionManager.donateSession(
    donorNetId,
    parsed.data.cookies,
    parsed.data.targetSystems,
    parsed.data.expiresAt
  );

  return c.json({ id: sessionId }, 201);
});

scraperRoutes.post("/jobs/:type/trigger", async (c) => {
  const schema = z.object({
    type: z.enum([
      "coursetableCatalog",
      "coursetableEvaluations",
      "yaliesDirectory",
      "yaleimsScores"
    ])
  });
  const parsed = schema.safeParse(c.req.param());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const queue = jobQueueMap[parsed.data.type];
  const job = await queue.add(parsed.data.type, { manual: true });

  return c.json({ jobId: job.id });
});

scraperRoutes.get("/jobs", async (c) => {
  const { data, error } = await serviceClient
    .from("scrape_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ data });
});
