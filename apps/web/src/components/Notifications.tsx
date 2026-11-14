"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/consts";
import { useSession } from "./NavigationShell";
import styles from "./notifications.module.scss";

type Notification = { id: string; subject: string; message: string; timestamp: string; color: string };

export default function Notifications() {
	const { isAuthenticated } = useSession();
	const [messages, setMessages] = useState<Notification[]>([]);
	const [dismissing, setDismissing] = useState<string[]>([]);
	const revision = useRef(0);
	const pending = useRef(new Set<string>());
	const [error, setError] = useState("");
	useEffect(() => {
		if(!isAuthenticated) { setMessages([]); return; }
		let active = true;
		const load = async () => {
			const version = revision.current;
			try {
				const response = await fetch(`${API_URL}/v3/notifications`, { credentials: "include", cache: "no-store" });
				if(response.ok) {
					const result = await response.json();
					if(active && version === revision.current && !pending.current.size && Array.isArray(result)) setMessages(result);
				}
			} catch { /* Keep existing notices during connection failures. */ }
		};
		void load();
		window.addEventListener("focus", load);
		return () => { active = false; window.removeEventListener("focus", load); };
	}, [isAuthenticated]);
	const dismiss = async (id: string) => {
		if(pending.current.has(id)) return;
		pending.current.add(id);
		revision.current++;
		setDismissing(current => [...current, id]);
		setError("");
		try {
			const [response] = await Promise.all([
				fetch(`${API_URL}/v3/notifications/${id}/viewed`, { method: "PATCH", credentials: "include" }),
				new Promise(resolve => setTimeout(resolve, 360)),
			]);
			if(!response.ok) throw new Error("Dismiss failed");
			setMessages(current => current.filter(message => message.id !== id));
		} catch { setError("Couldn’t dismiss this notification. Please try again."); }
		finally {
			pending.current.delete(id);
			revision.current++;
			setDismissing(current => current.filter(value => value !== id));
		}
	};
	if(!isAuthenticated || !messages.length) return null;
	return <section className={styles.notifications} aria-label="Notifications" aria-live="polite">
		{messages.map(message => <div key={message.id} className={styles.row} data-closing={dismissing.includes(message.id)} aria-hidden={dismissing.includes(message.id)}>
			<div className={styles.clip}><div className={styles.notice} data-color={message.color}>
			<div className={styles.text}><strong>{message.subject}</strong>{message.message && <><span className={styles.separator} aria-hidden="true"> | </span><span className={styles.body}>{message.message}</span></>}</div>
			<button type="button" aria-label={`Dismiss ${message.subject}`} disabled={dismissing.includes(message.id)} onClick={() => void dismiss(message.id)}>×</button>
			</div></div>
		</div>)}
		{error && <p className={styles.error} role="alert">{error}</p>}
	</section>;
}
