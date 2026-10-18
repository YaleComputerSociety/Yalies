import "express-session";
import "express";

declare module "express-session" {
	interface SessionData {
		netid?: string;
		passport?: { user?: unknown };
	}
}

declare module "express" {
	interface Request {
		netid?: string;
	}
}
