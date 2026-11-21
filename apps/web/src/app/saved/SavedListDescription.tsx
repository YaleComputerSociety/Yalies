"use client";

import { useEffect, useRef, useState } from "react";
import { SavedList } from "yalies-shared";
import { updateListDescription } from "@/hooks/useSavedLists";
import styles from "./saved.module.scss";

export default function SavedListDescription({ list }: { list: SavedList }) {
	const [draft, setDraft] = useState(list.description ?? "");
	const [status, setStatus] = useState("");
	const [focused, setFocused] = useState(false);
	const skipSave = useRef(false);
	const saving = useRef(false);
	useEffect(() => { setDraft(list.description ?? ""); }, [list.description]);
	const save = async () => {
		setFocused(false);
		if(skipSave.current) { skipSave.current = false; return; }
		if(saving.current || draft.trim() === (list.description ?? "")) return;
		saving.current = true;
		setStatus("Saving…");
		try { await updateListDescription(list.id, draft.trim()); setStatus("Saved"); }
		catch(error) { setStatus(error instanceof Error ? error.message : "Could not save description"); }
		finally { saving.current = false; }
	};
	return <div className={styles.description_row}>
		<input aria-label={`Description for ${list.name}`} placeholder="Add a short description of this list…"
			maxLength={160} value={draft} disabled={status === "Saving…"} className={styles.description_input}
			onFocus={() => setFocused(true)} onChange={event => { setDraft(event.target.value); setStatus(""); }}
			onBlur={() => void save()} onKeyDown={event => {
				if(event.nativeEvent.isComposing) return;
				if(event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
				if(event.key === "Escape") {
					skipSave.current = true;
					setDraft(list.description ?? "");
					event.currentTarget.blur();
				}
			}} />
		{focused && <span className={styles.field_hint}>{draft.length}/160</span>}
		{status && <span className={styles.field_hint} role="status">{status}</span>}
	</div>;
}
