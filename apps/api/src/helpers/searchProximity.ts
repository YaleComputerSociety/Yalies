import { Sequelize, type OrderItem } from "sequelize";

export interface SearchPerson {
	year?: number | null;
	college?: string | null;
}

// [column, row] in the supplied grid, starting at the top left, including the
// clarified Stiles/Morse positions two/three columns right of Pierson.
const COLLEGE_GRID: Record<string, readonly [number, number]> = {
	"Pierson College": [1, 0],
	"Ezra Stiles College": [3, 0],
	"Morse College": [4, 0],
	"Davenport College": [1, 1],
	"Jonathan Edwards College": [0, 2],
	"Branford College": [1, 2],
	"Saybrook College": [2, 2],
	"Trumbull College": [3, 2],
	"Berkeley College": [3, 3],
	"Grace Hopper College": [3, 4],
	"Benjamin Franklin College": [5, 4],
	"Pauli Murray College": [6, 4],
	"Silliman College": [4, 5],
	"Timothy Dwight College": [4, 6],
};

const UNKNOWN_DISTANCE = 1000000;

// Integer tenths avoid floating point differences breaking equal-distance ties.
export function collegeDistance(from: string, to: string): number {
	if (from === to) return 0;
	const a = COLLEGE_GRID[from];
	const b = COLLEGE_GRID[to];
	if (!a || !b) return UNKNOWN_DISTANCE;
	const dx = Math.abs(a[0] - b[0]);
	const dy = Math.abs(a[1] - b[1]);
	const diagonals = Math.min(dx, dy);
	return diagonals * 14 + (dx - diagonals) * 9 + (dy - diagonals) * 10;
}

export function searchProximity(viewer?: SearchPerson | null) {
	const year = viewer?.year != null && Number.isInteger(viewer.year) ? viewer.year : null;
	const college = viewer?.college || null;
	const distances = new Map(Object.keys(COLLEGE_GRID).map(name => [name, college ? collegeDistance(college, name) : 0]));
	if (college) distances.set(college, 0);
	const distance = (name?: string | null) => distances.get(name ?? "") ?? UNKNOWN_DISTANCE;
	const compare = (a: SearchPerson, b: SearchPerson) => {
		if (year !== null) {
			if (a.year == null && b.year != null) return 1;
			if (a.year != null && b.year == null) return -1;
			if (a.year != null && b.year != null) {
				const difference = Math.abs(a.year - year) - Math.abs(b.year - year) || b.year - a.year;
				if (difference) return difference;
			}
		}
		if (!college) return 0;
		return distance(a.college) - distance(b.college)
			|| Number(!a.college) - Number(!b.college)
			|| (a.college ?? "").localeCompare(b.college ?? "", "en");
	};
	// Legacy and initials searches sort in SQL so ordering also precedes LIMIT.
	const sqlOrder = (sequelize: Sequelize): OrderItem[] => {
		const order: OrderItem[] = [];
		if (year !== null) {
			order.push([Sequelize.literal(`ABS(year::bigint - ${sequelize.escape(year)})`), "ASC NULLS LAST"],
				["year", "DESC NULLS LAST"]);
		}
		if (college) {
			const cases = [...distances].map(([name, value]) => `WHEN ${sequelize.escape(name)} THEN ${value}`).join(" ");
			order.push([Sequelize.literal(`CASE college ${cases} ELSE ${UNKNOWN_DISTANCE} END`), "ASC"],
				["college", "ASC NULLS LAST"]);
		}
		return order;
	};
	return { compare, sqlOrder };
}
