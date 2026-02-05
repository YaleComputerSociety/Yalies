import type { MiddlewareHandler } from "hono";
import { authMiddleware } from "@ycs/auth";

/**
 * Require authentication.
 */
export const requireAuth = authMiddleware;

/**
 * Require admin privileges.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const isAdmin = c.get("isAdmin") as boolean | undefined;
  if (!isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};
