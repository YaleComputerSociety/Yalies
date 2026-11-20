"use client";

import { useState } from "react";
import { importListMembers, type ListImportResult } from "@/hooks/useSavedLists";
import styles from "./saved.module.scss";

export default function SavedListImport({ listId, onImported }: {
	listId: number;
	onImported: (result: ListImportResult) => void;
}) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	return <div className={styles.import_box}>
		{!open ? <button type="button" className={styles.primary_action} onClick={() => setOpen(true)}>
			Import by NetID or Email
		</button> : <form onSubmit={async event => {
			event.preventDefault();
			if(busy || !text.trim()) return;
			setBusy(true); setError("");
			try { onImported(await importListMembers(listId, text)); }
			catch(error) { setError(error instanceof Error ? error.message : "Import failed. Please try again."); }
			finally { setBusy(false); }
		}}>
			<label htmlFor={`list-import-${listId}`}>Paste email addresses or NetIDs</label>
			<p className={styles.field_hint}>Use commas, spaces, or new lines. We use whichever single separator finds the most people. Up to 1,000 entries.</p>
			<textarea id={`list-import-${listId}`} autoFocus rows={5} maxLength={50000} value={text}
				placeholder={"alex@yale.edu\nabc123\njamie@yale.edu"} disabled={busy} onChange={event => setText(event.target.value)} />
			<div className={styles.action_row}>
				<button type="submit" className={styles.primary_action} disabled={busy || !text.trim()}>{busy ? "Finding and adding…" : "Find and add people"}</button>
				<button type="button" className={styles.secondary_action} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
			</div>
			{error && <p className={styles.message} role="alert">{error}</p>}
		</form>}
	</div>;
}
