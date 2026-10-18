import { US_STATES } from "yalies-shared";

export const US_STATE_MAJOR_VALUES = [
	...Object.keys(US_STATES),
	...Object.values(US_STATES),
];

const US_STATE_CODES = new Set(Object.keys(US_STATES).map((code) => code.toLowerCase()));
const US_STATE_NAMES = new Set(Object.values(US_STATES).map((name) => name.toLowerCase()));

export function isUsState(value?: string): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return US_STATE_CODES.has(normalized) || US_STATE_NAMES.has(normalized);
}

export function findStudentsWithStateMajor<T extends { major?: string }>(students: T[]): T[] {
	return students.filter((student) => isUsState(student.major));
}
