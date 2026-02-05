import { Hono } from "hono";
import { getUserById } from "@ycs/db";

export const userRoutes = new Hono();

userRoutes.get("/me", async (c) => {
  const userId = c.get("userId") as string;
  const user = await getUserById(userId);
  if (!user) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(user);
});
