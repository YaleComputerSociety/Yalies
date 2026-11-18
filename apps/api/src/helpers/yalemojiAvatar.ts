import { Person, YaleMojiAvatar } from "yalies-shared";

function isAssetUrl(value: unknown): value is string {
	if(typeof value !== "string") return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password;
	} catch {
		return false;
	}
}

function getApiOrigin(): URL {
	const origin = new URL(process.env.YALEMOJI_API_URL || "https://www.yalemoji.com");
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
	if(origin.username || origin.password
		|| (origin.protocol !== "https:" && !(origin.protocol === "http:" && local && process.env.NODE_ENV === "development"))) {
		throw new Error("Invalid Yalemoji API URL");
	}
	return origin;
}

function parseAvatar(value: unknown): YaleMojiAvatar | undefined {
	if(!value || typeof value !== "object") return undefined;
	const avatar = value as Partial<YaleMojiAvatar>;
	if(typeof avatar.version !== "number" || !Number.isSafeInteger(avatar.version) || avatar.version < 1
		|| !isAssetUrl(avatar.png_url) || !isAssetUrl(avatar.svg_url) || !isAssetUrl(avatar.background_url)) return undefined;
	return {
		version: avatar.version,
		png_url: avatar.png_url,
		svg_url: avatar.svg_url,
		background_url: avatar.background_url,
	};
}

// Only the backend sends the app key. Browsers receive public, opaque asset URLs.
// null means Yalemoji confirmed no avatar; undefined means the lookup was unavailable.
export async function getYaleMojiAvatar(netid: string): Promise<YaleMojiAvatar | null | undefined> {
	const key = process.env.YALEMOJI_API_KEY;
	if(!key || !/^[a-z][a-z0-9]*$/i.test(netid)) return undefined;
	try {
		const response = await fetch(new URL(`/api/v1/users/${encodeURIComponent(netid.toLowerCase())}`, getApiOrigin()), {
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(3000),
			redirect: "error",
		});
		if(response.status === 404) return null;
		if(!response.ok) throw new Error(`Yalemoji status ${response.status}`);
		const { avatar } = await response.json() as { avatar?: unknown };
		const parsed = parseAvatar(avatar);
		if(!parsed) throw new Error("Invalid Yalemoji avatar response");
		return parsed;
	} catch {
		// An optional avatar service must not prevent profile/login from working.
		console.warn("[Yalemoji] Avatar lookup unavailable; using profile initials.");
		return undefined;
	}
}

export async function getYaleMojiAvatars(netids: string[]): Promise<Map<string, YaleMojiAvatar | null>> {
	const avatars = new Map<string, YaleMojiAvatar | null>();
	const key = process.env.YALEMOJI_API_KEY;
	const normalized = [...new Set(netids.map(netid => netid.trim().toLowerCase()))]
		.filter(netid => /^[a-z][a-z0-9]*$/.test(netid));
	if(!key || !normalized.length) return avatars;
	try {
		const origin = getApiOrigin();
		// The lookup API accepts at most 100 identities per request.
		for(let offset = 0; offset < normalized.length; offset += 100) {
			const batch = normalized.slice(offset, offset + 100);
			const response = await fetch(new URL("/api/v1/lookup", origin), {
				method: "POST",
				headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
				body: JSON.stringify({ netids: batch }),
				signal: AbortSignal.timeout(3000),
				redirect: "error",
			});
			if(!response.ok) throw new Error(`Yalemoji status ${response.status}`);
			const { users } = await response.json() as { users?: Record<string, unknown> };
			if(!users || typeof users !== "object" || Array.isArray(users)) throw new Error("Invalid Yalemoji lookup response");
			for(const netid of batch) {
				if(!Object.hasOwn(users, netid)) continue;
				const avatar = users[netid] === null ? null : parseAvatar(users[netid]);
				if(avatar !== undefined) avatars.set(netid, avatar);
			}
		}
	} catch {
		console.warn("[Yalemoji] Batch lookup unavailable; using default avatars.");
	}
	return avatars;
}

// Refresh avatars even for cached search results so newly saved avatars appear.
// Never mutate cached directory rows or persist an outage as a missing avatar.
export async function withYaleMojiAvatars(people: Person[]): Promise<Person[]> {
	const avatars = await getYaleMojiAvatars(people.flatMap(person => person.netid ? [person.netid] : []));
	return people.map(person => ({
		...person,
		yalemoji: person.netid ? avatars.get(person.netid.trim().toLowerCase()) ?? null : null,
	}));
}
