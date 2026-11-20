"use client";
import { API_URL } from "@/consts";

import styles from "./saved.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import PeopleGrid from "@/components/PeopleGrid";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { Person, API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import {
	createList,
	deleteList,
	getSavedEntry,
	loadSavedLists,
	renameList,
	useSavedLists,
} from "@/hooks/useSavedLists";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

const PAGE_SIZE = 20;
const MAX_LIST_NAME_LENGTH = 50;

export default function SavedPage() {
	const savedLists = useSavedLists();
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [selectedListId, setSelectedListId] = useState<number | null>(null);
	const [people, setPeople] = useState<Person[]>([]);
	const [currentPage, setCurrentPage] = useState(0);
	const [hasReachedEnd, setHasReachedEnd] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [newListName, setNewListName] = useState("");
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const [deleteStep, setDeleteStep] = useState(0);
	const requestVersion = useRef(0);

	const selectedList = savedLists.lists.find(list => list.id === selectedListId) ?? null;

	const loadPeople = async (listId: number | null, page: number) => {
		const version = ++requestVersion.current;
		setIsLoading(true);
		setError("");
		try {
			const response = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					filters: listId === null ? { is_saved: ["true"] } : { saved_list: [String(listId)] },
					page,
					page_size: PAGE_SIZE,
				}),
			});
			if(version !== requestVersion.current) return;
			if(response.status === 401) {
				setUnauthenticated(true);
				return;
			}
			if(!response.ok) {
				console.error("Error fetching saved people", response.status, await response.text());
				setError("Something went wrong. Please try again.");
				setHasReachedEnd(true);
				return;
			}
			const newPeople: Person[] = await response.json();
			if(version !== requestVersion.current) return;
			setPeople(prev => {
				if(page === 0) return newPeople;
				const seenNetids = new Set(prev.map(person => person.netid));
				return [...prev, ...newPeople.filter(person => !seenNetids.has(person.netid))];
			});
			setCurrentPage(page + 1);
			setHasReachedEnd(newPeople.length < PAGE_SIZE);
		} catch(e) {
			console.error(e);
			if(version === requestVersion.current) {
				setError("Failed to connect to the server. Please try again.");
				setHasReachedEnd(true);
			}
		} finally {
			if(version === requestVersion.current) setIsLoading(false);
		}
	};

	useEffect(() => {
		loadSavedLists();
	}, []);

	useEffect(() => {
		setPeople([]);
		setCurrentPage(0);
		setHasReachedEnd(false);
		setIsRenaming(false);
		setDeleteStep(0);
		loadPeople(selectedListId, 0);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedListId]);

	useEffect(() => {
		if(selectedListId !== null && savedLists.loaded && !selectedList) setSelectedListId(null);
	}, [selectedListId, savedLists.loaded, selectedList]);

	const loadMore = () => {
		if(!isLoading) loadPeople(selectedListId, currentPage);
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

	const onRename = (e: React.FormEvent) => {
		e.preventDefault();
		const name = renameValue.trim();
		if(!selectedList || !name) return;
		run(async () => {
			await renameList(selectedList.id, name);
			setIsRenaming(false);
		});
	};

	const onDelete = () => {
		if(!selectedList) return;
		if(deleteStep === 0) {
			setDeleteStep(1);
			return;
		}
		run(async () => {
			await deleteList(selectedList.id);
			setSelectedListId(null);
		});
	};

	if(isUnauthenticated) {
		return (
			<>
				<Topbar>
					<Navbar />
				</Topbar>
				<div className={`${styles.saved_header} ${logoFont.className}`}>
					<p>Please sign in to see your saved contacts.</p>
				</div>
			</>
		);
	}

	const visiblePeople = people.filter(person => {
		const entry = getSavedEntry(savedLists, person);
		if(!entry) return false;
		return selectedListId === null || entry.listIds.includes(selectedListId);
	});

	const emptyMessage = selectedList
		? `No one in ${selectedList.name} yet. On any card, click the arrow next to + and pick ${selectedList.name}.`
		: "No saved contacts yet. Click + on anyone in the Directory to save them.";

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>
			<div className={`${styles.saved_header} ${logoFont.className}`}>
				<div className={styles.title_row}>
					<h1>Saved</h1>
					<span className={styles.subtitle}>Only you can see who you&apos;ve saved.</span>
				</div>
				<div className={styles.list_chips} role="tablist" aria-label="Saved lists">
					<button
						type="button"
						role="tab"
						aria-selected={selectedListId === null}
						className={`${styles.chip} ${selectedListId === null ? styles.active : ""}`}
						onClick={() => setSelectedListId(null)}
					>
						All saved
						<span className={styles.count}>{savedLists.total}</span>
					</button>
					{savedLists.lists.map(list => (
						<button
							key={list.id}
							type="button"
							role="tab"
							aria-selected={selectedListId === list.id}
							className={`${styles.chip} ${selectedListId === list.id ? styles.active : ""}`}
							onClick={() => setSelectedListId(list.id)}
						>
							{list.name}
							<span className={styles.count}>{list.count}</span>
						</button>
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
				{selectedList && (
					<div className={styles.list_actions}>
						{isRenaming ? (
							<form className={styles.inline_form} onSubmit={onRename}>
								<input
									autoFocus
									value={renameValue}
									onChange={e => setRenameValue(e.target.value)}
									onKeyDown={e => {
										if(e.key === "Escape") setIsRenaming(false);
									}}
									maxLength={MAX_LIST_NAME_LENGTH}
									aria-label="List name"
								/>
								<button type="submit" className={styles.primary_action}>Save</button>
								<button type="button" className={styles.secondary_action} onClick={() => setIsRenaming(false)}>
									Cancel
								</button>
							</form>
						) : (
							<button
								type="button"
								className={styles.secondary_action}
								onClick={() => {
									setRenameValue(selectedList.name);
									setIsRenaming(true);
									setDeleteStep(0);
								}}
							>
								<FontAwesomeIcon icon={faPen} />
								Rename
							</button>
						)}
						<button type="button" className={`${styles.secondary_action} ${styles.delete_action}`} onClick={onDelete}>
							<FontAwesomeIcon icon={faTrash} />
							{deleteStep === 0 ? "Delete list" : "Click again to delete (people stay saved)"}
						</button>
					</div>
				)}
				{message && <p className={styles.message} role="status">{message}</p>}
				{error && <p className={styles.message}>{error}</p>}
			</div>
			<PeopleGrid
				people={visiblePeople}
				loadMoreFunction={loadMore}
				hasReachedEnd={hasReachedEnd}
				isSearching={isLoading && people.length === 0}
				emptyMessage={emptyMessage}
			/>
		</>
	);
}
