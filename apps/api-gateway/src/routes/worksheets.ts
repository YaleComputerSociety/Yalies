import { Hono } from "hono";
import { z } from "zod";
import {
  createWorksheet,
  deleteWorksheet,
  getWorksheetsByUser,
  updateWorksheet
} from "@ycs/db";

export const worksheetRoutes = new Hono();

worksheetRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const worksheets = await getWorksheetsByUser(userId);
  return c.json({ data: worksheets });
});

worksheetRoutes.post("/", async (c) => {
  const schema = z.object({
    season: z.string().min(1),
    name: z.string().min(1).default("My Worksheet"),
    courses: z.array(z.string()).default([])
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const userId = c.get("userId") as string;
  const worksheet = await createWorksheet(
    userId,
    parsed.data.season,
    parsed.data.name,
    parsed.data.courses
  );

  return c.json(worksheet, 201);
});

worksheetRoutes.put("/:id", async (c) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    courses: z.array(z.string()).optional()
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const id = c.req.param("id");
  const worksheet = await updateWorksheet(id, parsed.data);
  return c.json(worksheet);
});

worksheetRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await deleteWorksheet(id);
  return c.json({ status: "deleted" });
});
