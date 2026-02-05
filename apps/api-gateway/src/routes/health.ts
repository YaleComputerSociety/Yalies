import { Hono } from "hono";
import { serviceClient } from "@ycs/db";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  const { error } = await serviceClient.from("users").select("id").limit(1);
  if (error) {
    return c.json(
      { status: "unhealthy", db: "error", message: error.message },
      500
    );
  }

  return c.json({
    status: "healthy",
    db: "connected",
    timestamp: new Date().toISOString()
  });
});
