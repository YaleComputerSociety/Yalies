export type RequestUser = {
	netId?: string;
};

declare module "express-session" {
	interface SessionData {
		netid?: string;
	}
}

declare module "express" {
	interface Request {
		netid?: string;
	}
};
