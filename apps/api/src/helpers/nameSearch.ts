import { Op, QueryTypes, Sequelize, type FindAttributeOptions } from "sequelize";
import { searchProximity, type SearchPerson } from "./searchProximity.js";

const NAME_FIELDS = ["first_name", "preferred_name", "last_name"] as const;

// Shared by startup and integration tests. Double Metaphone is used only after
// accent folding, and only for ASCII words; other scripts retain literal/typo matching.
export const NAME_SEARCH_SETUP_SQL = `
	CREATE EXTENSION IF NOT EXISTS pg_trgm;
	CREATE EXTENSION IF NOT EXISTS unaccent;
	CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
	CREATE OR REPLACE FUNCTION yalies_normalize_name(text) RETURNS text AS $$
		SELECT trim(regexp_replace(
			replace(replace(lower(unaccent(normalize(coalesce($1, ''), NFKD))), '''', ''), '’', ''),
			'[^[:alnum:]]+', ' ', 'g'));
	$$ LANGUAGE SQL STABLE PARALLEL SAFE;
	CREATE OR REPLACE FUNCTION yalies_name_phonetics(text) RETURNS text[] AS $$
		SELECT CASE WHEN $1 ~ '^[a-z]+$' AND length($1) >= 4 THEN ARRAY[
			'dm:' || dmetaphone($1), 'dm:' || dmetaphone_alt($1), 'sx:' || soundex($1)
		] ELSE ARRAY[]::text[] END;
	$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;
	CREATE OR REPLACE FUNCTION yalies_name_words(text) RETURNS jsonb AS $$
		SELECT coalesce(jsonb_agg(jsonb_build_object(
			'text', word,
			'phonetics', yalies_name_phonetics(word)
		)), '[]'::jsonb)
		FROM regexp_split_to_table(yalies_normalize_name($1), ' ') AS word WHERE word <> '';
	$$ LANGUAGE SQL STABLE PARALLEL SAFE;
`;

export interface SearchWord {
	text: string;
	phonetics: string[];
}

export interface NameSearchCandidate extends SearchPerson {
	id: number;
	first_words: SearchWord[];
	preferred_words: SearchWord[];
	last_words: SearchWord[];
}

interface Match {
	tier: number;
	score: number;
}

type CandidateLoader = (where: ReturnType<typeof Sequelize.literal>, attributes: FindAttributeOptions) => Promise<NameSearchCandidate[]>;

const KEY_POSITIONS = new Map(Array.from("qwertyuiop").map((key, x) => [key, [x, 0]]));
for (const [y, row, offset] of [[1, "asdfghjkl", 0.25], [2, "zxcvbnm", 0.75]] as const) {
	Array.from(row).forEach((key, x) => KEY_POSITIONS.set(key, [x + offset, y]));
}

function neighbors(a: string, b: string) {
	const first = KEY_POSITIONS.get(a);
	const second = KEY_POSITIONS.get(b);
	return first && second && Math.abs(first[1] - second[1]) <= 1 && Math.abs(first[0] - second[0]) <= 1;
}

// Weighted optimal-string-alignment distance. Tracking edit count prevents
// several cheap keyboard substitutions from turning an unrelated word into a hit.
export function keyboardDistance(query: string, name: string) {
	const a = Array.from(query);
	const b = Array.from(name);
	const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => ({ cost: (i + j) * 0.8, edits: i + j })),
	);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const same = a[i - 1] === b[j - 1];
			const alternatives = [
				{ cost: matrix[i - 1][j].cost + 0.8, edits: matrix[i - 1][j].edits + 1 },
				{ cost: matrix[i][j - 1].cost + 0.8, edits: matrix[i][j - 1].edits + 1 },
				{ cost: matrix[i - 1][j - 1].cost + (same ? 0 : neighbors(a[i - 1], b[j - 1]) ? 0.5 : 1), edits: matrix[i - 1][j - 1].edits + (same ? 0 : 1) },
			];
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				alternatives.push({ cost: matrix[i - 2][j - 2].cost + 0.5, edits: matrix[i - 2][j - 2].edits + 1 });
			}
			matrix[i][j] = alternatives.sort((x, y) => x.cost - y.cost || x.edits - y.edits)[0];
		}
	}
	return matrix[a.length][b.length];
}

function maxEdits(term: string) {
	return Array.from(term).length < 4 ? 1 : Array.from(term).length < 8 ? 2 : 3;
}

export function scoreNameWord(query: SearchWord, name: SearchWord): Match | null {
	if (query.text === name.text) return { tier: 0, score: 1 };
	// Query coverage, rather than the fraction of the candidate name consumed.
	// Unqueried suffixes and surnames never dilute relevance.
	if (name.text.startsWith(query.text)) return { tier: 0, score: 0.96 };
	if (name.text.includes(query.text)) return { tier: 1, score: 0.9 };
	const length = Array.from(query.text).length;
	if (length < 3) return null;
	const soundsLike = query.phonetics.some(key => key !== "" && name.phonetics.includes(key));
	const lengthDifference = Math.abs(length - Array.from(name.text).length);
	if (lengthDifference > maxEdits(query.text) && !soundsLike) return null;
	if (lengthDifference * 0.8 > Math.min(3, length * 0.65)) return null;
	const distance = keyboardDistance(query.text, name.text);
	const score = 1 - distance.cost / length;
	const withinEdits = distance.edits <= maxEdits(query.text);
	if (withinEdits && distance.cost <= 0.800001) return { tier: 2, score };
	if (soundsLike && distance.cost <= Math.min(3, length * 0.65)) return { tier: 3, score };
	if (withinEdits && distance.cost <= Math.min(2.4, length * 0.3) + 0.000001) return { tier: 4, score };
	return null;
}

// Maximum-weight rectangular assignment (Hungarian algorithm). Every query term
// must use a DIFFERENT name word; greedy matching fails on "john johnson".
function assignedScore(matches: (Match | null)[][], tier: number): number | null {
	const n = matches.length;
	const m = matches[0]?.length ?? 0;
	if (!n || n > m) return null;
	const u = Array(n + 1).fill(0);
	const v = Array(m + 1).fill(0);
	const p = Array(m + 1).fill(0);
	const way = Array(m + 1).fill(0);
	for (let i = 1; i <= n; i++) {
		p[0] = i;
		let j0 = 0;
		const min = Array(m + 1).fill(Infinity);
		const used = Array(m + 1).fill(false);
		do {
			used[j0] = true;
			const i0 = p[j0];
			let delta = Infinity;
			let j1 = 0;
			for (let j = 1; j <= m; j++) {
				if (used[j]) continue;
				const match = matches[i0 - 1][j - 1];
				const cost = (match && match.tier <= tier ? 1 - match.score : 1000000) - u[i0] - v[j];
				if (cost < min[j]) { min[j] = cost; way[j] = j0; }
				if (min[j] < delta) { delta = min[j]; j1 = j; }
			}
			for (let j = 0; j <= m; j++) {
				if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
				else min[j] -= delta;
			}
			j0 = j1;
		} while (p[j0] !== 0);
		do {
			const j1 = way[j0];
			p[j0] = p[j1];
			j0 = j1;
		} while (j0 !== 0);
	}
	let score = 0;
	for (let j = 1; j <= m; j++) {
		if (!p[j]) continue;
		const match = matches[p[j] - 1][j - 1];
		if (!match || match.tier > tier) return null;
		score += match.score;
	}
	return score / n;
}

export function scoreName(query: SearchWord[], candidate: NameSearchCandidate, wordScores = new Map<string, Match | null>()): Match | null {
	let best: Match | null = null;
	// Preferred and legal first names are alternatives, not words that can be
	// combined into an invented full name.
	for (const first of [candidate.first_words, candidate.preferred_words]) {
		const words = [...first, ...candidate.last_words];
		const matches = query.map(term => words.map(word => {
			const key = `${term.text}\0${word.text}`;
			if (!wordScores.has(key)) wordScores.set(key, scoreNameWord(term, word));
			return wordScores.get(key)!;
		}));
		for (let tier = 0; tier <= 4; tier++) {
			const score = assignedScore(matches, tier);
			if (score === null) continue;
			if (!best || tier < best.tier || tier === best.tier && score > best.score) best = { tier, score };
			break;
		}
	}
	return best;
}

function candidateWhere(sequelize: Sequelize, terms: SearchWord[], fuzzy: boolean, split: boolean) {
	const clauses = terms.map(({ text, phonetics }) => {
		const term = sequelize.escape(text);
		const checks = [`word LIKE ${sequelize.escape(`%${text}%`)}`];
		if (fuzzy && Array.from(text).length >= 3) {
			// An OSA transposition is at most two ordinary Levenshtein edits.
			// This recall-safe prefilter leaves final keyboard costs to the scorer.
			const distance = maxEdits(text) * 2;
			checks.push(`levenshtein_less_equal(left(word, 255), ${term}, ${distance}) <= ${distance}`);
			if (phonetics.length) {
				const keys = phonetics.map(key => sequelize.escape(key)).join(", ");
				checks.push(`yalies_name_phonetics(word) && ARRAY[${keys}]::text[]`);
			}
		}
		return `EXISTS (SELECT 1 FROM regexp_split_to_table(yalies_normalize_name(concat_ws(' ', ${NAME_FIELDS.join(", ")})), ' ') AS word WHERE ${checks.join(" OR ")})`;
	});
	return Sequelize.literal(`(${clauses.join(split ? " OR " : " AND ")})`);
}

function compareCandidates(a: NameSearchCandidate, b: NameSearchCandidate) {
	const text = (words: SearchWord[]) => words.map(word => word.text).join(" ");
	return text(a.last_words).localeCompare(text(b.last_words), "en")
		|| text(a.first_words).localeCompare(text(b.first_words), "en") || a.id - b.id;
}

// Filters belong in loadCandidates, BEFORE selecting the successful tier.
// Return the entire ranked ID set; pagination must never cause a looser retry.
export async function findNameSearchIds(sequelize: Sequelize, query: string, loadCandidates: CandidateLoader, viewer?: SearchPerson | null): Promise<number[]> {
	if (query.length > 200 || /[^\p{L}\p{M}\s.'’\-]/u.test(query)) return [];
	const [normalized] = await sequelize.query<{ words: SearchWord[] }>(
		"SELECT yalies_name_words(CAST($query AS text)) AS words", { bind: { query }, type: QueryTypes.SELECT },
	);
	const terms = normalized.words;
	if (!terms.length) return [];
	const wordScores = new Map<string, Match | null>();
	const { compare: compareProximity } = searchProximity(viewer);
	// For a single-word query, prefer the beginning of a legal/preferred first
	// name over surname or interior-word hits, without changing match eligibility.
	const givenNameStartsWithQuery = (candidate: NameSearchCandidate) => terms.length === 1
		&& [candidate.first_words, candidate.preferred_words].some(words => words[0]?.text.startsWith(terms[0].text));
	const attributes: FindAttributeOptions = ["id", ...(viewer ? ["year", "college"] : []), ...NAME_FIELDS.map((field, i) =>
		[Sequelize.fn("yalies_name_words", Sequelize.col(field)), ["first_words", "preferred_words", "last_words"][i]] as [ReturnType<typeof Sequelize.fn>, string],
	)];
	for (const fuzzy of [false, true]) {
		const candidates = await loadCandidates(candidateWhere(sequelize, terms, fuzzy, false), attributes);
		const scored = candidates.flatMap(candidate => {
			const match = scoreName(terms, candidate, wordScores);
			return match && (fuzzy || match.tier <= 1) ? [{ candidate, ...match }] : [];
		});
		if (!scored.length) continue;
		const bestTier = scored.reduce((best, match) => Math.min(best, match.tier), Infinity);
		return scored.filter(match => match.tier === bestTier)
			.sort((a, b) => compareProximity(a.candidate, b.candidate)
				|| Number(givenNameStartsWithQuery(b.candidate)) - Number(givenNameStartsWithQuery(a.candidate))
				|| b.score - a.score || compareCandidates(a.candidate, b.candidate))
			.map(match => match.candidate.id);
	}
	if (terms.length < 2) return [];
	// After full-name matching is exhausted, search each term independently.
	// Each term chooses its own successful tier, then deduplicate the union.
	const combined = new Map<number, { candidate: NameSearchCandidate; score: number; count: number }>();
	let remaining = terms;
	for (const fuzzy of [false, true]) {
		if (!remaining.length) break;
		const candidates = await loadCandidates(candidateWhere(sequelize, remaining, fuzzy, true), attributes);
		const unmatched: SearchWord[] = [];
		for (const term of remaining) {
			const scored = candidates.flatMap(candidate => {
				const match = scoreName([term], candidate, wordScores);
				return match && (fuzzy || match.tier <= 1) ? [{ candidate, ...match }] : [];
			});
			if (!scored.length) { unmatched.push(term); continue; }
			const bestTier = scored.reduce((best, match) => Math.min(best, match.tier), Infinity);
			for (const match of scored.filter(match => match.tier === bestTier)) {
				const previous = combined.get(match.candidate.id);
				combined.set(match.candidate.id, {
					candidate: match.candidate, score: (previous?.score ?? 0) + match.score, count: (previous?.count ?? 0) + 1,
				});
			}
		}
		remaining = unmatched;
	}
	return [...combined.values()].sort((a, b) => compareProximity(a.candidate, b.candidate)
		|| b.count - a.count || b.score - a.score || compareCandidates(a.candidate, b.candidate))
		.map(match => match.candidate.id);
}

export function normalizeInitials(query: string): string | null {
	const initials = query.replace(/[\s.]/g, "").toUpperCase();
	return /^\p{L}{2}$/u.test(initials) ? initials : null;
}

export function buildInitialsSearch(initials: string) {
	const letters = Array.from(initials);
	return {
		[Op.and]: [
			Sequelize.where(Sequelize.fn("UPPER", Sequelize.fn("LEFT", Sequelize.col("first_name"), 1)), letters[0].toUpperCase()),
			Sequelize.where(Sequelize.fn("UPPER", Sequelize.fn("LEFT", Sequelize.col("last_name"), 1)), letters[1].toUpperCase()),
		],
	};
}
