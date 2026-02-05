import { Person } from "../yalies-shared/datatypes";

export type RequestUser = {
	netId?: string;
};

export type PersonElasticsearchResult = {
	_id: string;
	_score: number;
	_source: Person;
}

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
