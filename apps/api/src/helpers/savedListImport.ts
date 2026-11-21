export const MAX_IMPORT_LENGTH = 50000;
export const MAX_IMPORT_IDENTIFIERS = 1000;

export function getImportCandidates(text: unknown) {
	if(typeof text !== "string" || !text.trim() || text.length > MAX_IMPORT_LENGTH) {
		throw new Error(`Paste email addresses or NetIDs (up to ${MAX_IMPORT_LENGTH} characters).`);
	}
	const candidates = ([
		["newlines", /\r?\n/], ["commas", /,/], ["spaces", /[ \t]+/],
	] as const).map(([delimiter, separator]) => ({
		delimiter,
		tokens: [...new Set(text.split(separator).map(token => token.trim().toLowerCase()).filter(Boolean))],
	}));
	if(candidates.some(candidate => candidate.tokens.length > MAX_IMPORT_IDENTIFIERS)) {
		throw new Error(`Import up to ${MAX_IMPORT_IDENTIFIERS} email addresses or NetIDs at a time.`);
	}
	return candidates;
}

export function resolveImport(candidates: ReturnType<typeof getImportCandidates>, people: { netid: string; email: string | null }[], owner: string) {
	const lookup = new Map<string, Set<string>>();
	for(const person of people) {
		if(!person.netid) continue;
		for(const identity of [person.netid, person.email]) {
			if(!identity) continue;
			const key = identity.trim().toLowerCase();
			const matches = lookup.get(key) ?? new Set<string>();
			matches.add(person.netid);
			lookup.set(key, matches);
		}
	}
	const resolutions = candidates.map(candidate => {
		const netids = new Set<string>();
		const unmatched: string[] = [];
		const ambiguous: string[] = [];
		const skippedSelf: string[] = [];
		for(const token of candidate.tokens) {
			const matches = lookup.get(token);
			if(!matches?.size) unmatched.push(token);
			else if(matches.size > 1) ambiguous.push(token);
			else {
				const netid = [...matches][0];
				if(netid.toLowerCase() === owner.toLowerCase()) skippedSelf.push(token);
				else netids.add(netid);
			}
		}
		return { delimiter: candidate.delimiter, netids: [...netids], unmatched, ambiguous, skipped_self: skippedSelf };
	});
	// Stable ties favor line-separated input, then commas, then spaces. Never mix delimiters.
	return resolutions.sort((a, b) => b.netids.length - a.netids.length)[0];
}
