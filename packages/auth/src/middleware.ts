import type { MiddlewareHandler } from "hono";
import { validateSession } from "@ycs/db";

/**
 * Hono middleware that validates a Bearer token and sets user context.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await validateSession(token);
  if (!session || !session.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", session.user_id);
  c.set("netId", session.user.net_id);
  c.set("isAdmin", (session.user as { is_admin?: boolean }).is_admin ?? false);
  await next();
};
