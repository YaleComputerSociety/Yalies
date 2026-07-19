import { Person } from "yalies-shared";

type HomeCache = {
	people: Person[];
	birthdayPeople: Person[];
	filters: Record<string, string[]>;
	query: string;
	currentPage: number;
	hasReachedEnd: boolean;
	browseSeed: number;
	timestamp: number;
};

const CACHE_TTL = 5 * 60 * 1000; 
let cached: HomeCache | null = null;

export function getHomeCache(): HomeCache | null {
	if (!cached) return null;
	if (Date.now() - cached.timestamp > CACHE_TTL) {
		cached = null;
		return null;
	}
	return cached;
}

export function setHomeCache(data: Omit<HomeCache, "timestamp">) {
	cached = { ...data, timestamp: Date.now() };
}

export function invalidateHomeCache() {
	cached = null;
}
