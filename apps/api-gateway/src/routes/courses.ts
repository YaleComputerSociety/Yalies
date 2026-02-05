import { Hono } from "hono";
import { z } from "zod";
import { getCourseByKey, getCoursesBySeason, searchCourses } from "@ycs/db";

export const courseRoutes = new Hono();

const listSchema = z.object({
  season: z.string().min(1),
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0)
});

courseRoutes.get("/", async (c) => {
  const parsed = listSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { season, limit, offset } = parsed.data;
  const result = await getCoursesBySeason(season, limit, offset);
  return c.json(result);
});

courseRoutes.get("/search", async (c) => {
  const schema = z.object({
    q: z.string().min(1),
    limit: z.coerce.number().min(1).max(200).default(50),
    offset: z.coerce.number().min(0).default(0)
  });
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const result = await searchCourses(parsed.data.q, parsed.data.limit, parsed.data.offset);
  return c.json(result);
});

courseRoutes.get("/:season/:crn", async (c) => {
  const schema = z.object({
    season: z.string().min(1),
    crn: z.string().min(1)
  });
  const parsed = schema.safeParse(c.req.param());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const course = await getCourseByKey(parsed.data.season, parsed.data.crn);
  if (!course) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(course);
});
