"use client";
import { useEffect, useRef, useState } from "react";
import { Person } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCheck, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Lexend_Deca } from "next/font/google";
import styles from "./savetolistbutton.module.scss";
import {
	createList,
	getListName,
	getSavedEntry,
	loadSavedLists,
	removeFromList,
	saveToList,
	unsave,
	useSavedLists,
} from "@/hooks/useSavedLists";

const listFont = Lexend_Deca({ subsets: ["latin"] });

const MAX_LIST_NAME_LENGTH = 50;
const STATUS_DURATION_MS = 2000;

function MenuItem({
	label,
	checked,
	isDefault,
	onClick,
}: {
	label: string;
	checked: boolean;
	isDefault: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="menuitemcheckbox"
			aria-checked={checked}
			className={`${styles.menu_item} ${checked ? styles.checked : ""}`}
			onClick={onClick}
		>
			<span className={styles.checkbox}>{checked && <FontAwesomeIcon icon={faCheck} />}</span>
			<span className={styles.menu_label}>{label}</span>
			{isDefault && <span className={styles.default_tag}>Default</span>}
		</button>
	);
}

export default function SaveToListButton({
	person,
	className,
}: {
	person: Person;
	className?: string;
}) {
	const savedLists = useSavedLists();
	const entry = getSavedEntry(savedLists, person);
	const saved = entry !== null;
	const [menuOpen, setMenuOpen] = useState(false);
	const [status, setStatus] = useState("");
	const [statusVisible, setStatusVisible] = useState(false);
	const [newListName, setNewListName] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const statusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const netid = person.netid ?? "";

	useEffect(() => {
		loadSavedLists();
		return () => {
			if(statusTimeout.current) clearTimeout(statusTimeout.current);
		};
	}, []);

	useEffect(() => {
		if(!menuOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if(containerRef.current && !containerRef.current.contains(e.target as Node)) setMenuOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [menuOpen]);

	const showStatus = (text: string) => {
		setStatus(text);
		setStatusVisible(true);
		if(statusTimeout.current) clearTimeout(statusTimeout.current);
		statusTimeout.current = setTimeout(() => setStatusVisible(false), STATUS_DURATION_MS);
	};

	const run = async (action: () => Promise<string | void>) => {
		try {
			const message = await action();
			if(message) showStatus(message);
		} catch(e) {
			console.error(e);
			showStatus(e instanceof Error && e.message ? e.message : "Something went wrong");
		}
	};

	const onMainClick = () => {
		if(saved) {
			setMenuOpen(open => !open);
			return;
		}
		run(async () => {
			const defaultListId = await saveToList(netid, entry);
			return `Saved to ${getListName(savedLists, defaultListId)}`;
		});
	};

	const onPickList = (listId: number | null) => {
		if(listId !== null && entry?.listIds.includes(listId)) {
			run(async () => {
				await removeFromList(netid, entry, listId);
				return `Removed from ${getListName(savedLists, listId)}`;
			});
			return;
		}
		run(async () => {
			await saveToList(netid, entry, listId);
			return `Saved to ${getListName(savedLists, listId)}`;
		});
	};

	const onCreateList = (e: React.FormEvent) => {
		e.preventDefault();
		const name = newListName.trim();
		if(!name) return;
		run(async () => {
			const list = await createList(name);
			await saveToList(netid, entry, list.id);
			setNewListName("");
			return `Saved to ${list.name}`;
		});
	};

	const onRemove = () => {
		run(async () => {
			setMenuOpen(false);
			await unsave(netid, entry);
			return "Removed from saved";
		});
	};

	const defaultName = getListName(savedLists, savedLists.defaultListId);
	const mainLabel = saved ? "Saved. Change lists" : `Save to ${defaultName}`;

	return (
		<div
			ref={containerRef}
			className={`${styles.container} ${className ?? ""}`}
			data-menu-open={menuOpen}
			onClick={e => e.stopPropagation()}
		>
			{status && (
				<span className={`${styles.status} ${statusVisible ? styles.status_visible : ""} ${listFont.className}`} role="status">
					{status}
				</span>
			)}
			<div className={`${styles.split} ${saved ? styles.saved : ""}`}>
				<button
					type="button"
					className={styles.main_button}
					onClick={onMainClick}
					aria-label={mainLabel}
					title={mainLabel}
				>
					<FontAwesomeIcon icon={saved ? faCheck : faPlus} className={saved ? undefined : styles.plus_icon} />
				</button>
				<button
					type="button"
					className={styles.caret_button}
					onClick={() => setMenuOpen(open => !open)}
					aria-label="Choose a list"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					title="Choose a list"
				>
					<FontAwesomeIcon icon={faCaretDown} />
				</button>
			</div>
			{menuOpen && (
				<div className={`${styles.menu} ${listFont.className}`} role="menu">
					<div className={styles.menu_title}>Save to</div>
					<MenuItem
						label="All saved"
						checked={saved}
						isDefault={savedLists.defaultListId === null}
						onClick={() => onPickList(null)}
					/>
					{savedLists.lists.map(list => (
						<MenuItem
							key={list.id}
							label={list.name}
							checked={!!entry?.listIds.includes(list.id)}
							isDefault={savedLists.defaultListId === list.id}
							onClick={() => onPickList(list.id)}
						/>
					))}
					<form className={styles.new_list} onSubmit={onCreateList}>
						<FontAwesomeIcon icon={faPlus} />
						<input
							value={newListName}
							onChange={e => setNewListName(e.target.value)}
							placeholder="New list"
							maxLength={MAX_LIST_NAME_LENGTH}
							aria-label="New list name"
						/>
					</form>
					{saved && (
						<button type="button" className={styles.remove} onClick={onRemove}>
							<FontAwesomeIcon icon={faTrash} />
							Remove from saved
						</button>
					)}
				</div>
			)}
		</div>
	);
}
