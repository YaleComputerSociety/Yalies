import { FacebookStudent, EnrichedStudent, DbRow } from "./types.js";
import { toDbRow } from "./loadDb.js";

let facebookData: FacebookStudent[] | null = null;
let enrichedData: EnrichedStudent[] | null = null;

export const getFacebookData = (): FacebookStudent[] | null => facebookData;

export const setFacebookData = (data: FacebookStudent[]): void => {
	facebookData = data;
};

export const getEnrichedData = (): EnrichedStudent[] | null => enrichedData;

export const setEnrichedData = (data: EnrichedStudent[]): void => {
	enrichedData = data;
};

export const clearAll = (): void => {
	facebookData = null;
	enrichedData = null;
};

export const getPreviewStats = (): Record<string, unknown> => {
	const data = enrichedData ?? facebookData;

	const stats: Record<string, unknown> = {
		hasFacebookData: facebookData !== null,
		hasEnrichedData: enrichedData !== null,
		facebookCount: facebookData?.length ?? 0,
		totalStudents: data?.length ?? 0,
		enrichedCount: enrichedData ? enrichedData.filter((s) => s.netid).length : 0,
	};

	if (data) {
		const collegeSet = new Set<string>();
		for (const s of data) {
			if (s.college) collegeSet.add(s.college);
		}
		stats.colleges = collegeSet.size;

		const yearSet = new Set<number>();
		for (const s of data) {
			const y = s.year;
			if (y?.startsWith("'")) {
				const parsed = parseInt(y.slice(1));
				if (!isNaN(parsed)) yearSet.add(2000 + parsed);
			}
		}
		stats.years = Array.from(yearSet).sort();
	}

	return stats;
};

export const getPreviewStudents = (limit: number): DbRow[] => {
	const data = enrichedData ?? facebookData;
	if (!data) return [];

	return data
		.slice(0, limit)
		.map((s) => toDbRow(s as EnrichedStudent));
};
