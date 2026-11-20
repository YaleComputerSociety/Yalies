"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopoverPosition } from "@/hooks/usePopoverPosition";
import { SavedList } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faEllipsis, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { deleteList, duplicateList, renameList } from "@/hooks/useSavedLists";
import styles from "./saved.module.scss";

const MAX_LIST_NAME_LENGTH = 50;

export default function SavedListChip({ list, selected, onSelect, onDuplicate, onError }: {
	list: SavedList;
	selected: boolean;
	onSelect: () => void;
	onDuplicate: (id: number) => void;
	onError: (message: string) => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(list.name);
	const [busy, setBusy] = useState(false);
	const container = useRef<HTMLDivElement>(null);
	const menuButton = useRef<HTMLButtonElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const menuPosition = usePopoverPosition(menuOpen, container, menu, 210);
	const editingRef = useRef(false);
	const busyRef = useRef(false);

	useEffect(() => {
		if(editing) {
			input.current?.focus();
			input.current?.select();
		}
	}, [editing]);

	useEffect(() => {
		if(!menuOpen) return;
		const closeOutside = (event: MouseEvent) => {
			if(!container.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setMenuOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if(event.key === "Escape") {
				setMenuOpen(false);
				menuButton.current?.focus();
			}
		};
		document.addEventListener("mousedown", closeOutside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("mousedown", closeOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [menuOpen]);

	const run = async (action: () => Promise<void>) => {
		if(busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		onError("");
		try {
			await action();
			setMenuOpen(false);
		} catch(error) {
			onError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};

	const finishRename = () => {
		if(!editingRef.current) return;
		editingRef.current = false;
		setEditing(false);
		const name = draft.trim();
		if(name && name !== list.name) void run(() => renameList(list.id, name));
	};

	return <div ref={container} className={`${styles.chip_group} ${selected ? styles.active : ""}`}>
		{editing ? (
			<div className={styles.chip_editor}>
				<input ref={input} value={draft} maxLength={MAX_LIST_NAME_LENGTH}
					aria-label={`Rename ${list.name}`} title="Up to 50 characters. Enter or click away to save; Escape to cancel."
					style={{ width: `${Math.max(4, Math.min(draft.length + 1, 24))}ch` }}
					onChange={event => setDraft(event.target.value)} onBlur={finishRename}
					onKeyDown={event => {
						if(event.nativeEvent.isComposing) return;
						if(event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						} else if(event.key === "Escape") {
							event.preventDefault();
							editingRef.current = false;
							setEditing(false);
							menuButton.current?.focus();
						}
					}} />
				<span className={styles.name_limit}>{draft.length}/{MAX_LIST_NAME_LENGTH}</span>
			</div>
		) : (
			<button type="button" role="tab" aria-selected={selected} className={styles.chip_select}
				onClick={() => { setMenuOpen(false); onSelect(); }} title={list.name}>
				<span className={styles.chip_name}>{list.name}</span>
				<span className={styles.count}>{list.count}</span>
			</button>
		)}
		<button ref={menuButton} type="button" className={styles.chip_menu_button} disabled={busy || editing}
			aria-label={`Options for ${list.name}`} aria-expanded={menuOpen} aria-haspopup="true"
			onClick={() => { setConfirmDelete(false); setMenuOpen(open => !open); }}>
			<FontAwesomeIcon icon={faEllipsis} />
		</button>
		{menuOpen && createPortal(
			<div ref={menu} className={styles.chip_menu} style={menuPosition} aria-label={`${list.name} options`}
				onBlur={event => {
					if(!container.current?.contains(event.relatedTarget as Node) && !menu.current?.contains(event.relatedTarget as Node)) setMenuOpen(false);
				}}>
				{confirmDelete ? <>
					<p>Delete this list? People in other lists stay saved.</p>
					<button type="button" className={styles.delete_action} disabled={busy}
						onClick={() => void run(() => deleteList(list.id))}>
						<FontAwesomeIcon icon={faTrash} /> Delete list
					</button>
					<button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
				</> : <>
					<button type="button" disabled={busy} onClick={() => {
						setMenuOpen(false);
						setDraft(list.name);
						editingRef.current = true;
						setEditing(true);
					}}><FontAwesomeIcon icon={faPen} /> Rename</button>
					<button type="button" disabled={busy} onClick={() => void run(async () => {
						const duplicate = await duplicateList(list.id);
						onDuplicate(duplicate.id);
					})}><FontAwesomeIcon icon={faCopy} /> Duplicate</button>
					<button type="button" disabled={busy} className={styles.delete_action}
						onClick={() => setConfirmDelete(true)}><FontAwesomeIcon icon={faTrash} /> Delete</button>
				</>}
			</div>, document.body
		)}
	</div>;
}
