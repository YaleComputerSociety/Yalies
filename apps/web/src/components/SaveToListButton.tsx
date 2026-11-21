"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopoverPosition } from "@/hooks/usePopoverPosition";
import { Person } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCheck, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Lexend_Deca } from "next/font/google";
import { useSession } from "./NavigationShell";
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
	currentListId,
}: {
	person: Person;
	className?: string;
	currentListId?: number;
}) {
	const { isAuthenticated, netid: viewerNetid } = useSession();
	const savedLists = useSavedLists();
	const entry = getSavedEntry(savedLists, person);
	const saved = currentListId === undefined ? entry !== null : !!entry?.listIds.includes(currentListId);
	const [menuOpen, setMenuOpen] = useState(false);
	const [status, setStatus] = useState("");
	const [statusVisible, setStatusVisible] = useState(false);
	const [newListName, setNewListName] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuPosition = usePopoverPosition(menuOpen, containerRef, menuRef, 260);
	const statusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const netid = person.netid ?? "";

	useEffect(() => {
		if(isAuthenticated && person.netid !== viewerNetid) loadSavedLists();
		return () => {
			if(statusTimeout.current) clearTimeout(statusTimeout.current);
		};
	}, [isAuthenticated, person.netid, viewerNetid]);

	useEffect(() => {
		if(!menuOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if(!containerRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
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
			const defaultListId = await saveToList(netid, entry, currentListId);
			return `Saved to ${getListName(savedLists, defaultListId)}`;
		});
	};

	const onPickList = (listId: number) => {
		if(entry?.listIds.includes(listId)) {
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
			if(currentListId !== undefined) {
				await removeFromList(netid, entry, currentListId);
				return "Removed from list";
			}
			await unsave(netid, entry);
			return "Removed from saved";
		});
	};

	const defaultName = getListName(savedLists, currentListId ?? savedLists.defaultListId);
	const mainLabel = !savedLists.loaded ? "Loading lists…" : saved ? "Saved. Change lists" : `Save to ${defaultName}`;

	if(!isAuthenticated || !person.netid || person.netid === viewerNetid) return null;

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
					disabled={!savedLists.loaded}
					title={mainLabel}
				>
					<span className={styles.save_icon} data-saved={saved} aria-hidden="true">
						<FontAwesomeIcon icon={faPlus} className={styles.plus_icon} />
						<FontAwesomeIcon icon={faCheck} className={styles.check_icon} />
					</span>
				</button>
				<button
					type="button"
					className={styles.caret_button}
					onClick={() => setMenuOpen(open => !open)}
					aria-label="Choose a list"
					disabled={!savedLists.loaded}
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					title="Choose a list"
				>
					<FontAwesomeIcon icon={faCaretDown} />
				</button>
			</div>
			{menuOpen && createPortal(
				<div ref={menuRef} className={`${styles.menu} ${listFont.className}`} style={menuPosition} role="menu">
					<div className={styles.menu_title}>Save to</div>
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
							{currentListId === undefined ? "Remove from saved" : "Remove from list"}
						</button>
					)}
				</div>, document.body
			)}
		</div>
	);
}
