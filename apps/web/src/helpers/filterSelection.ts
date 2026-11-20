export const EXCLUDE_PREFIX = "exclude_";

export function selectedFilterValues(filters: Record<string, string[]>, field: string) {
	return Array.from(new Set([...(filters[field] ?? []), ...(filters[EXCLUDE_PREFIX + field] ?? [])]));
}

export function filterSelectionUpdate(filters: Record<string, string[]>, field: string, selected: string[]) {
	const excluded = (filters[EXCLUDE_PREFIX + field] ?? []).filter(value => selected.includes(value));
	return { [field]: selected.filter(value => !excluded.includes(value)), [EXCLUDE_PREFIX + field]: excluded };
}

export function filterExclusionUpdate(filters: Record<string, string[]>, field: string, value: string) {
	const excluded = filters[EXCLUDE_PREFIX + field] ?? [];
	const nextExcluded = excluded.includes(value) ? excluded.filter(item => item !== value) : [...excluded, value];
	const selected = Array.from(new Set([...selectedFilterValues(filters, field), value]));
	return { [field]: selected.filter(item => !nextExcluded.includes(item)), [EXCLUDE_PREFIX + field]: nextExcluded };
}

export function splitFilterSelections(filters: Record<string, string[]>) {
	const active = Object.entries(filters).filter(([, values]) => values.length > 0);
	return {
		filterObject: Object.fromEntries(active.filter(([key]) => !key.startsWith(EXCLUDE_PREFIX))),
		excludedFilterObject: Object.fromEntries(active.filter(([key]) => key.startsWith(EXCLUDE_PREFIX))
			.map(([key, values]) => [key.slice(EXCLUDE_PREFIX.length), values])),
	};
}
