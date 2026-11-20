"use client";
import { API_URL } from "@/consts";

import styles from "./saved.module.scss";
import { useSession } from "@/components/NavigationShell";
import PeopleGrid from "@/components/PeopleGrid";
import { Lexend_Deca } from "next/font/google";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Person, API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
	createList,
	getSavedEntry,
	refreshSavedLists,
	useSavedLists,
	type ListImportResult,
} from "@/hooks/useSavedLists";

import SavedListChip from "./SavedListChip";
import SavedListDescription from "./SavedListDescription";
import SavedListImport from "./SavedListImport";
import { filterSavedPeople, getListClipboard } from "@/helpers/savedListTools";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

const PAGE_SIZE = 100;
const RENDER_BATCH = 20;
const MAX_LIST_NAME_LENGTH = 50;
const SHOW_NOTES_STORAGE_KEY = "yalies-show-list-notes";

export default function SavedPage() {
	const { isAuthenticated, setAuthenticated } = useSession();
	const savedLists = useSavedLists();
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [selectedListId, setSelectedListId] = useState<number | null>(null);
	const [people, setPeople] = useState<Person[]>([]);
	const [visibleLimit, setVisibleLimit] = useState(RENDER_BATCH);
	const [reloadVersion, setReloadVersion] = useState(0);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [year, setYear] = useState("");
	const [college, setCollege] = useState("");
	const [showNotes, setShowNotes] = useState(true);
	const [copyLabels, setCopyLabels] = useState<Partial<Record<"netid" | "email", string>>>({});
	const copyTimers = useRef<Partial<Record<"netid" | "email", ReturnType<typeof setTimeout>>>>({});
	const [importResult, setImportResult] = useState<ListImportResult | null>(null);
	const [showImportSummary, setShowImportSummary] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [newListName, setNewListName] = useState("");

	useEffect(() => {
		try {
			setShowNotes(window.localStorage.getItem(SHOW_NOTES_STORAGE_KEY) !== "false");
		} catch {
			// Keep the default when browser storage is unavailable.
		}
	}, []);

	const toggleNotes = () => {
		const nextShowNotes = !showNotes;
		setShowNotes(nextShowNotes);
		try {
			window.localStorage.setItem(SHOW_NOTES_STORAGE_KEY, String(nextShowNotes));
		} catch {
			// The toggle still works when browser storage is unavailable.
		}
	};

	const selectedList = savedLists.lists.find(list => list.id === selectedListId)
		?? savedLists.lists.find(list => list.id === savedLists.defaultListId)
		?? savedLists.lists[0] ?? null;
	const activeListId = selectedList?.id;
	const activeListRef = useRef(activeListId);
	useEffect(() => { activeListRef.current = activeListId; }, [activeListId]);

	useEffect(() => {
		refreshSavedLists().catch(error => {
			setError(error instanceof Error ? error.message : "Could not load your lists.");
		});
	}, []);

	useEffect(() => {
		if(isAuthenticated !== undefined) setUnauthenticated(!isAuthenticated);
	}, [isAuthenticated]);

	useEffect(() => {
		if(activeListId !== undefined && !savedLists.lists.some(list => list.id === selectedListId)) {
			setSelectedListId(activeListId);
		}
	}, [activeListId, savedLists.lists, selectedListId]);

	useEffect(() => {
		setQuery(""); setYear(""); setCollege(""); setCopyLabels({}); setImportResult(null);
		const timers = copyTimers.current;
		Object.values(timers).forEach(timer => clearTimeout(timer));
		return () => Object.values(timers).forEach(timer => clearTimeout(timer));
	}, [activeListId]);

	useEffect(() => {
		if(!importResult) return;
		setShowImportSummary(true);
		const timer = setTimeout(() => setShowImportSummary(false), 2000);
		return () => clearTimeout(timer);
	}, [importResult]);

	useEffect(() => { setVisibleLimit(RENDER_BATCH); }, [activeListId, deferredQuery, year, college]);

	useEffect(() => {
		if(activeListId === undefined) return;
		const controller = new AbortController();
		setPeople([]); setIsLoading(true); setError("");
		const load = async () => {
			try {
				const all = new Map<string, Person>();
				for(let page = 0; ; page++) {
					const response = await fetch(`${API_URL}${API.people}`, {
						method: "POST", credentials: "include", signal: controller.signal,
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ filters: { saved_list: [String(activeListId)] }, page, page_size: PAGE_SIZE }),
					});
					if(response.status === 401) { setAuthenticated(false); return; }
					if(!response.ok) throw new Error("Could not load this list. Please try again.");
					const batch: Person[] = await response.json();
					if(controller.signal.aborted) return;
					for(const person of batch) if(person.netid) all.set(person.netid, person);
					setPeople(Array.from(all.values()));
					if(batch.length < PAGE_SIZE) break;
				}
				setAuthenticated(true);
			} catch(error) {
				if(!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load list");
			} finally { if(!controller.signal.aborted) setIsLoading(false); }
		};
		void load();
		return () => controller.abort();
	}, [activeListId, reloadVersion, setAuthenticated]);

	const memberPeople = useMemo(() => people.flatMap(person => {
		const entry = getSavedEntry(savedLists, person);
		if(!entry || activeListId === undefined || !entry.listIds.includes(activeListId)) return [];
		return [{ ...person, saved_data: { saved: true, note: entry.note, list_ids: entry.listIds } }];
	}), [people, savedLists, activeListId]);
	const filteredPeople = useMemo(() => filterSavedPeople(memberPeople, deferredQuery, year, college), [memberPeople, deferredQuery, year, college]);
	const years = useMemo(() => Array.from(new Set(memberPeople.flatMap(person => person.year ? [person.year] : []))).sort((a, b) => b - a), [memberPeople]);
	const colleges = useMemo(() => Array.from(new Set(memberPeople.flatMap(person => person.college ? [person.college] : []))).sort(), [memberPeople]);
	const visiblePeople = filteredPeople.slice(0, visibleLimit);
	const hasFilters = Boolean(query.trim() || year || college);
	const copyList = async (field: "netid" | "email") => {
		const listId = activeListId;
		const result = getListClipboard(memberPeople, field);
		let label = "Copied!";
		try {
			if(result.count) await navigator.clipboard.writeText(result.text);
			else label = field === "email" ? "No emails" : "No NetIDs";
		} catch { label = "Copy failed"; }
		if(activeListRef.current !== listId) return;
		clearTimeout(copyTimers.current[field]);
		setCopyLabels(previous => ({ ...previous, [field]: label }));
		copyTimers.current[field] = setTimeout(() => {
			setCopyLabels(previous => ({ ...previous, [field]: undefined }));
		}, 2000);
	};

	const run = async (action: () => Promise<void>) => {
		setMessage("");
		try {
			await action();
		} catch(e) {
			console.error(e);
			setMessage(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
		}
	};

	const onCreate = (e: React.FormEvent) => {
		e.preventDefault();
		const name = newListName.trim();
		if(!name) return;
		run(async () => {
			const list = await createList(name);
			setNewListName("");
			setIsCreating(false);
			setSelectedListId(list.id);
		});
	};

	if(isUnauthenticated) {
		return (
			<>
				<div className={`${styles.saved_header} ${logoFont.className}`}>
					<p>Please sign in to see your lists.</p>
				</div>
			</>
		);
	}

	const emptyMessage = hasFilters
		? "No people match these filters. Try another name, note, year, or college."
		: `No one in ${selectedList?.name ?? "this list"} yet. Import email addresses or NetIDs below, or save someone from the Directory.`;

	return (
		<>
			<div className={`${styles.saved_header} ${logoFont.className}`}>
				<div className={styles.list_chips} role="tablist" aria-label="Lists">
					{savedLists.lists.map(list => (
						<SavedListChip key={list.id} list={list} selected={activeListId === list.id}
							onSelect={() => setSelectedListId(list.id)} onDuplicate={setSelectedListId} onError={setMessage} />
					))}
					{isCreating ? (
						<form className={styles.inline_form} onSubmit={onCreate}>
							<input
								autoFocus
								value={newListName}
								onChange={e => setNewListName(e.target.value)}
								onKeyDown={e => {
									if(e.key === "Escape") {
										setIsCreating(false);
										setNewListName("");
									}
								}}
								placeholder="List name"
								maxLength={MAX_LIST_NAME_LENGTH}
								aria-label="New list name"
							/>
							<button type="submit" className={styles.primary_action}>Create</button>
							<button
								type="button"
								className={styles.secondary_action}
								onClick={() => {
									setIsCreating(false);
									setNewListName("");
								}}
							>
								Cancel
							</button>
						</form>
					) : (
						<button
							type="button"
							className={`${styles.chip} ${styles.new_list_chip}`}
							onClick={() => setIsCreating(true)}
						>
							<FontAwesomeIcon icon={faPlus} />
							New list
						</button>
					)}
				</div>
				{selectedList && <div className={styles.description_toolbar}>
					<SavedListDescription key={selectedList.id} list={selectedList} />
					{memberPeople.length > 0 && <div className={styles.description_actions}>
						<button type="button" className={`${styles.secondary_action} ${styles.copy_button}`} disabled={isLoading || !!error} title="Copy NetIDs for the entire list, one per line" aria-live="polite" onClick={() => void copyList("netid")}>{copyLabels.netid ?? "Copy NetIDs"}</button>
						<button type="button" className={`${styles.secondary_action} ${styles.copy_button}`} disabled={isLoading || !!error} title="Copy email addresses for the entire list, one per line" aria-live="polite" onClick={() => void copyList("email")}>{copyLabels.email ?? "Copy emails"}</button>
						<button type="button" className={`${styles.secondary_action} ${styles.notes_toggle}`} aria-pressed={showNotes} onClick={toggleNotes}>{showNotes ? "Hide notes" : "Show notes"}</button>
					</div>}
				</div>}
				{memberPeople.length > 0 && <>
					<div className={styles.list_toolbar}>
						<label className={styles.search_field}>
							<span className={styles.sr_only}>Filter this list by name or note</span>
							<input type="search" placeholder="Search names or notes…" value={query} onChange={event => setQuery(event.target.value)} />
						</label>
						<select aria-label="Filter by year" value={year} onChange={event => setYear(event.target.value)}>
							<option value="">All years</option>
							{years.map(value => <option key={value} value={value}>{value}</option>)}
						</select>
						<select aria-label="Filter by college" value={college} onChange={event => setCollege(event.target.value)}>
							<option value="">All colleges</option>
							{colleges.map(value => <option key={value} value={value}>{value.replace(/ College$/, "")}</option>)}
						</select>
					</div>
				</>}
				{importResult && (showImportSummary || importResult.unmatched.length > 0 || importResult.ambiguous.length > 0 || importResult.skipped_self.length > 0) && <div className={styles.import_result} role="status">
					{showImportSummary && <p>{importResult.added} people added using {importResult.delimiter}.{importResult.already_in_list > 0 ? ` ${importResult.already_in_list} already in this list.` : ""}</p>}
					{importResult.skipped_self.length > 0 && <p>Your own account was skipped.</p>}
					{importResult.unmatched.length > 0 && <details><summary>{importResult.unmatched.length} entries not found</summary><p>{importResult.unmatched.join("\n")}</p></details>}
					{importResult.ambiguous.length > 0 && <details><summary>{importResult.ambiguous.length} ambiguous entries skipped</summary><p>{importResult.ambiguous.join("\n")}</p></details>}
				</div>}
				{message && <p className={styles.message} role="status">{message}</p>}
				{error && <p className={styles.message}>{error}</p>}
			</div>
			<PeopleGrid
				showSavedNotes={showNotes}
				currentListId={activeListId}
				paginationLength={visiblePeople.length}
				people={visiblePeople}
				loadMoreFunction={() => setVisibleLimit(limit => limit + RENDER_BATCH)}
				hasReachedEnd={visibleLimit >= filteredPeople.length}
				isSearching={(isLoading && people.length === 0) || (!savedLists.loaded && !error)}
				emptyMessage={emptyMessage}
			/>
			{selectedList && !isLoading && !error && memberPeople.length === 0 && <SavedListImport key={selectedList.id} listId={selectedList.id}
				onImported={result => {
					if(activeListRef.current !== selectedList.id) return;
					setImportResult(result);
					if(result.added > 0) setReloadVersion(version => version + 1);
				}} />}
		</>
	);
}
