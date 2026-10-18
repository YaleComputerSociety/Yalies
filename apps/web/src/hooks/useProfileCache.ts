import { API_URL } from "@/consts";
import { Person, UserProfile, API } from "yalies-shared";

export type PendingPhotoRequest = {
	id: number;
	status: "pending";
	created_at: string;
	preview_image: string;
};

type CachedProfile = {
	profile: UserProfile;
	person: Person | null;
	photoRequest: PendingPhotoRequest | null;
	timestamp: number;
};

const CACHE_TTL = 60 * 1000; 
let cached: CachedProfile | null = null;
let inflight: Promise<CachedProfile | null> | null = null;

async function fetchFullProfile(): Promise<CachedProfile | null> {
	try {
		const response = await fetch(`${API_URL}${API.profileMeFull}`, {
			credentials: "include",
			headers: { "Content-Type": "application/json" },
		});
		if (!response.ok) return null;
		const { profile, person, photo_request } = await response.json();
		const result: CachedProfile = {
			profile,
			person,
			photoRequest: photo_request ?? null,
			timestamp: Date.now(),
		};
		cached = result;
		return result;
	} catch {
		return null;
	} finally {
		inflight = null;
	}
}

export function prefetchProfile() {
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
	if (inflight) return;
	inflight = fetchFullProfile();
}

export async function getProfile(): Promise<CachedProfile | null> {
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached;
	if (inflight) return inflight;
	inflight = fetchFullProfile();
	return inflight;
}

export function invalidateProfileCache() {
	cached = null;
}
