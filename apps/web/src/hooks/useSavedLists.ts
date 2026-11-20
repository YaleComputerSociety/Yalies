import { useSyncExternalStore } from "react";
import { API, Person, SavedList } from "yalies-shared";
import { API_URL } from "@/consts";

export type SavedEntry = { listIds: number[]; note: string | null } | null;

type SavedListsState = {
	loaded: boolean;
	lists: SavedList[];
	defaultListId: number | null;
	total: number;
	entries: Record<string, SavedEntry>;
};

let state: SavedListsState = { loaded: false, lists: [], defaultListId: null, total: 0, entries: {} };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function setState(update: Partial<SavedListsState>) {
	state = { ...state, ...update };
	listeners.forEach(listener => listener());
}

function setEntry(netid: string, entry: SavedEntry) {
	setState({ entries: { ...state.entries, [netid]: entry } });
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

async function request(path: string, method: string, body?: unknown) {
	const response = await fetch(`${API_URL}${path}`, {
		method,
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if(!response.ok) throw new Error(await response.text() || `Error ${response.status}`);
	return response.json();
}

export function useSavedLists() {
	return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getSavedEntry(savedLists: SavedListsState, person: Person): SavedEntry {
	if(person.netid && person.netid in savedLists.entries) return savedLists.entries[person.netid];
	if(!person.saved_data?.saved) return null;
	return { listIds: person.saved_data.list_ids ?? [], note: person.saved_data.note };
}

export function getListName(savedLists: SavedListsState, listId: number | null) {
	if(listId === null) return "All saved";
	return savedLists.lists.find(list => list.id === listId)?.name ?? "All saved";
}

export async function refreshSavedLists() {
	const data: { lists: SavedList[]; default_list_id: number | null; total: number } = await request(API.savedLists, "GET");
	setState({ loaded: true, lists: data.lists, defaultListId: data.default_list_id, total: data.total });
}

export function loadSavedLists() {
	if(state.loaded) return Promise.resolve();
	loading ??= refreshSavedLists()
		.catch(e => console.error(e))
		.finally(() => { loading = null; });
	return loading;
}

export async function saveToList(netid: string, current: SavedEntry, listId?: number | null) {
	const target = listId === undefined ? state.defaultListId : listId;
	const listIds = current?.listIds ?? [];
	setEntry(netid, {
		listIds: target === null || listIds.includes(target) ? listIds : [...listIds, target],
		note: current?.note ?? null,
	});
	try {
		const data: { note: string | null; list_ids: number[]; default_list_id: number | null } =
			await request(API.savedFor(netid), "PUT", listId === undefined ? {} : { list_id: listId });
		setEntry(netid, { listIds: data.list_ids, note: data.note });
		setState({ defaultListId: data.default_list_id });
		refreshSavedLists().catch(e => console.error(e));
		return data.default_list_id;
	} catch(e) {
		setEntry(netid, current);
		throw e;
	}
}

export async function removeFromList(netid: string, current: SavedEntry, listId: number) {
	if(!current) return;
	setEntry(netid, { ...current, listIds: current.listIds.filter(id => id !== listId) });
	try {
		const data: { list_ids: number[] } = await request(API.savedListMember(listId, netid), "DELETE");
		setEntry(netid, { ...current, listIds: data.list_ids });
		refreshSavedLists().catch(e => console.error(e));
	} catch(e) {
		setEntry(netid, current);
		throw e;
	}
}

export async function unsave(netid: string, current: SavedEntry) {
	setEntry(netid, null);
	try {
		await request(API.savedFor(netid), "DELETE");
		refreshSavedLists().catch(e => console.error(e));
	} catch(e) {
		setEntry(netid, current);
		throw e;
	}
}

export async function updateNote(netid: string, current: SavedEntry, note: string) {
	if(!current) return;
	const data: { note: string | null } = await request(API.savedFor(netid), "PATCH", { note });
	setEntry(netid, { ...current, note: data.note });
}

export async function createList(name: string): Promise<SavedList> {
	const data: { list: SavedList } = await request(API.savedLists, "POST", { name });
	setState({ lists: [...state.lists, data.list] });
	return data.list;
}

export async function renameList(listId: number, name: string) {
	const data: { list: SavedList } = await request(API.savedList(listId), "PATCH", { name });
	setState({ lists: state.lists.map(list => list.id === listId ? data.list : list) });
}

export async function deleteList(listId: number) {
	await request(API.savedList(listId), "DELETE");
	const entries = Object.fromEntries(Object.entries(state.entries).map(([netid, entry]) => [
		netid,
		entry && { ...entry, listIds: entry.listIds.filter(id => id !== listId) },
	]));
	setState({
		lists: state.lists.filter(list => list.id !== listId),
		defaultListId: state.defaultListId === listId ? null : state.defaultListId,
		entries,
	});
}
