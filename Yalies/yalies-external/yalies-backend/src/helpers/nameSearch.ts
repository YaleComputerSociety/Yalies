import { Op, Sequelize, type OrderItem } from "sequelize";

const NAME_FIELDS = ["first_name", "preferred_name", "last_name"] as const;

function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, "\\$&");
}

function adjacentTranspositions(term: string) {
	const letters = Array.from(term);
	if (letters.length < 4) return [];
	return [...new Set(letters.slice(1).map((_, index) => {
		const variant = [...letters];
		[variant[index], variant[index + 1]] = [variant[index + 1], variant[index]];
		return variant.join("");
	}))];
}

// Match each name term independently, including preferred names and reversed order.
// Short terms stay literal; longer terms tolerate typos and adjacent transpositions.
export function buildFuzzyNameSearch(sequelize: Sequelize, query: string) {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const clauses = terms.map(term => {
		const patterns = [term, ...adjacentTranspositions(term)]
			.map(value => sequelize.escape(`%${escapeLike(value)}%`));
		return `(${NAME_FIELDS.map(field => {
			const literalMatches = patterns.map(pattern => `${field} ILIKE ${pattern}`);
			if (Array.from(term).length >= 3) {
				literalMatches.push(`word_similarity(${sequelize.escape(term)}, LOWER(COALESCE(${field}, ''))) >= 0.45`);
			}
			return literalMatches.join(" OR ");
		}).join(" OR ")})`;
	});
	const scores = terms.map(term => `GREATEST(${NAME_FIELDS.map(field =>
		`word_similarity(${sequelize.escape(term)}, LOWER(COALESCE(${field}, '')))`
	).join(", ")})`);
	return {
		where: Sequelize.literal(clauses.join(" AND ") || "TRUE"),
		similarityOrder: [Sequelize.literal(scores.join(" + ") || "0"), "DESC"] as OrderItem,
	};
}

export function normalizeInitials(query: string): string | null {
	const initials = query.replace(/[\s.]/g, "").toUpperCase();
	return /^\p{L}{2}$/u.test(initials) ? initials : null;
}

export function buildInitialsSearch(initials: string) {
	return {
		[Op.and]: [
			Sequelize.where(Sequelize.fn("UPPER", Sequelize.fn("LEFT", Sequelize.col("first_name"), 1)), initials[0].toUpperCase()),
			Sequelize.where(Sequelize.fn("UPPER", Sequelize.fn("LEFT", Sequelize.col("last_name"), 1)), initials[1].toUpperCase()),
		],
	};
}
