import { API_URL } from "@/consts";
import { API, type YaleMojiAvatar } from "yalies-shared";

const STORAGE_KEY = "yalies-yalemoji";
const RETURN_KEY = "yalies-yalemoji-return";
const REFRESH_DELAY_MS = 5000;
type Listener = (avatar: YaleMojiAvatar | null) => void;
type Entry = {
	avatar: YaleMojiAvatar | null;
	listeners: Set<Listener>;
	inflight?: Promise<void>;
	cancelDelay?: () => void;
};

// This cache lives for the document, so route changes and multiple profile
// buttons share both the avatar and the initial refresh.
const entries = new Map<string, Entry>();
let returningFromYaleMoji = false;
let listeningForReturn = false;

function readCachedAvatar(netid: string): YaleMojiAvatar | null {
	try {
		const cached = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
		const avatar = cached?.avatar;
		if(cached?.netid !== netid || !avatar || !Number.isSafeInteger(avatar.version) || avatar.version < 1) return null;
		for(const asset of [avatar.png_url, avatar.svg_url, avatar.background_url]) {
			if(typeof asset !== "string" || new URL(asset).protocol !== "https:") return null;
		}
		return avatar;
	} catch {
		return null;
	}
}

function refresh(netid: string, entry: Entry): Promise<void> {
	entry.cancelDelay?.();
	if(entry.inflight) return entry.inflight;
	entry.inflight = (async () => {
		try {
			const response = await fetch(`${API_URL}${API.profileMeYaleMoji}`, { credentials: "include", cache: "no-store" });
			if(!response.ok) return;
			const result = await response.json();
			if(result.netid !== netid || entries.get(netid) !== entry) return;
			entry.avatar = result.yalemoji ?? null;
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ netid, avatar: entry.avatar }));
			} catch { /* Keep the in-memory cache when storage is unavailable. */ }
			entry.listeners.forEach((listener) => listener(entry.avatar));
		} catch { /* Keep the last avatar on network failures. */ }
		finally {
			entry.inflight = undefined;
		}
	})();
	return entry.inflight;
}

function refreshOnReturn() {
	if(document.visibilityState === "hidden") return;
	const activeEntries = Array.from(entries).filter(([, entry]) => entry.listeners.size > 0);
	if(!activeEntries.length) return;
	try {
		returningFromYaleMoji ||= window.sessionStorage.getItem(RETURN_KEY) === "true";
	} catch { /* The in-memory flag still works without storage. */ }
	if(!returningFromYaleMoji) return;
	returningFromYaleMoji = false;
	try {
		window.sessionStorage.removeItem(RETURN_KEY);
	} catch { /* Storage may be disabled. */ }
	activeEntries.forEach(([netid, entry]) => void refresh(netid, entry));
}

export function markYaleMojiVisit() {
	returningFromYaleMoji = true;
	try {
		window.sessionStorage.setItem(RETURN_KEY, "true");
	} catch { /* The in-memory flag covers new-tab visits. */ }
}

export function clearYaleMojiCache() {
	entries.forEach((entry) => entry.cancelDelay?.());
	entries.clear();
	returningFromYaleMoji = false;
	try {
		window.localStorage.removeItem(STORAGE_KEY);
		window.sessionStorage.removeItem(RETURN_KEY);
	} catch { /* Storage may be disabled. */ }
}

export function subscribeYaleMoji(netid: string, listener: Listener): () => void {
	if(!listeningForReturn) {
		window.addEventListener("focus", refreshOnReturn);
		window.addEventListener("pageshow", refreshOnReturn);
		document.addEventListener("visibilitychange", refreshOnReturn);
		listeningForReturn = true;
	}
	let entry = entries.get(netid);
	const isNew = !entry;
	if(!entry) {
		entry = { avatar: readCachedAvatar(netid), listeners: new Set() };
		entries.set(netid, entry);
	}
	const current = entry;
	current.listeners.add(listener);
	listener(current.avatar);
	refreshOnReturn();
	if(isNew && !current.inflight) {
		if(current.avatar) {
			let timer: ReturnType<typeof setTimeout>;
			const schedule = () => {
				const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
				const elapsed = navigation?.loadEventEnd ? performance.now() - navigation.loadEventEnd : 0;
				timer = setTimeout(() => void refresh(netid, current), Math.max(0, REFRESH_DELAY_MS - elapsed));
			};
			current.cancelDelay = () => {
				clearTimeout(timer);
				window.removeEventListener("load", schedule);
			};
			if(document.readyState === "complete") schedule();
			else window.addEventListener("load", schedule, { once: true });
		} else {
			void refresh(netid, current);
		}
	}
	// Delayed refreshes survive unmounts during navigation.
	return () => { current.listeners.delete(listener); };
}
