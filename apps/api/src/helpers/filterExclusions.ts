import { Op, type WhereOptions } from "sequelize";

const EXCLUDABLE_FIELDS = new Set(["year", "college", "major", "address_country", "address_state"]);
export type ExcludedFilters = Record<string, string[]>;

export function parseExcludedFilters(input: unknown): ExcludedFilters {
	if(input == null) return {};
	if(typeof input !== "object" || Array.isArray(input)) throw new Error("Excluded filters must be an object");
	const result: ExcludedFilters = {};
	for(const [field, values] of Object.entries(input)) {
		if(!EXCLUDABLE_FIELDS.has(field)) throw new Error(`Cannot exclude by field ${field}`);
		if(!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== "string" || !value.trim() || value.length > 512)) {
			throw new Error("Excluded filter values must be an array of nonempty strings");
		}
		if(field === "year" && values.some(value => !/^\d{4}$/.test(value))) throw new Error("Excluded years must be four-digit years");
		if(values.length > 0) result[field] = [...new Set(values)];
	}
	return result;
}

// Negation must retain unknown values: SQL NOT IN and NOT ILIKE alone drop NULLs.
export function buildExcludedFiltersWhere(filters: ExcludedFilters): WhereOptions {
	const conditions: WhereOptions[] = [];
	for(const [field, values] of Object.entries(filters)) {
		if(field === "address_country") {
			for(const country of values) {
				conditions.push({ [Op.or]: [{ address_country: { [Op.ne]: country } }, { address_country: null }] });
				conditions.push({ [Op.or]: [{ address: { [Op.notILike]: `%${country.replace(/[\\%_]/g, "\\$&")}%` } }, { address: null }] });
			}
		} else if(values.length > 0) {
			conditions.push({ [Op.or]: [
				{ [field]: { [Op.notIn]: field === "year" ? values.map(Number) : values } },
				{ [field]: null },
			] });
		}
	}
	return conditions.length > 0 ? { [Op.and]: conditions } : {};
}

// Countries and states are choices within one Location filter, so includes use OR.
export function buildLocationIncludesWhere(filters: Record<string, unknown>): WhereOptions {
	const values = (field: string): string[] => {
		const value = filters[field];
		return value == null ? [] : (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
	};
	const conditions: WhereOptions[] = values("address_country").map(country => ({ [Op.or]: [
		{ address_country: country }, { address: { [Op.iLike]: `%${country}%` } },
	] }));
	const states = values("address_state");
	if(states.length > 0) conditions.push({ address_state: { [Op.in]: states } });
	return conditions.length > 0 ? { [Op.or]: conditions } : {};
}
