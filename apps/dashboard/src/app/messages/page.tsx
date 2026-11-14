"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { NOTIFICATION_COMPOSE_COLORS, PIPELINE_API } from "yalies-shared";
import styles from "./messages.module.scss";

const API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL ?? "";
type Message = { id: string; to: string; subject: string; message: string; timestamp: string; color: string; viewed_at: string | null };
const easternTime = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric",
	hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
});
const formatTime = (value: string) => easternTime.format(new Date(value));

export default function MessagesPage() {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
	const [page, setPage] = useState(1);
	const [messages, setMessages] = useState<Message[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [refresh, setRefresh] = useState(0);
	const [to, setTo] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [color, setColor] = useState("green");
	const [sending, setSending] = useState(false);
	const sendingRef = useRef(false);
	const [sendError, setSendError] = useState("");
	const [sent, setSent] = useState("");
	const send = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (sendingRef.current) return;
		sendingRef.current = true;
		setSending(true); setSendError(""); setSent("");
		try {
			const response = await fetch(`${API_URL}${PIPELINE_API.messages}`, {
				method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ to: to.trim().toLowerCase(), subject, message: body, color }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || "Could not send message");
			setSent(`Message sent to ${result.to}.`);
			setTo(""); setSubject(""); setBody(""); setColor("green");
			setSearch(""); setStatus("all"); setPage(1); setRefresh(value => value + 1);
		} catch (err) {
			setSendError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Could not confirm sending. Check message history before retrying.");
		} finally { sendingRef.current = false; setSending(false); }
	};
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setError("");
		const timer = setTimeout(async () => {
			try {
				const params = new URLSearchParams({ search, status, page: String(page) });
				const response = await fetch(`${API_URL}${PIPELINE_API.messages}?${params}`, { credentials: "include", cache: "no-store", signal: controller.signal });
				if (!response.ok) throw new Error("Could not load messages");
				const result = await response.json();
				if (!controller.signal.aborted) { setMessages(result.messages); setTotal(result.total); }
			} catch (err) {
				if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load messages");
			} finally { if (!controller.signal.aborted) setLoading(false); }
		}, 250);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [search, status, page, refresh]);
	return <section className={styles.page}>
		<h1>Messages</h1>
		<p>All user notifications. Times are Eastern Time (EST or EDT). Viewed means the recipient clicked X to dismiss.</p>
		<form className={styles.compose} onSubmit={send}>
			<h2>Send a message</h2>
			<fieldset disabled={sending}>
				<label htmlFor="message-to">To (NetID)</label>
				<input id="message-to" required maxLength={32} pattern="[A-Za-z][A-Za-z0-9]*" autoCapitalize="none" autoCorrect="off" placeholder="e.g. yef3" value={to} onChange={event => setTo(event.target.value)} />
				<label htmlFor="message-subject">Subject</label>
				<input id="message-subject" required maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} />
				<label htmlFor="message-body">Message</label>
				<textarea id="message-body" required rows={3} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} />
				<label htmlFor="message-color">Color</label>
				<select id="message-color" value={color} onChange={event => setColor(event.target.value)}>
					{NOTIFICATION_COMPOSE_COLORS.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
				</select>
				<button type="submit">{sending ? "Sending…" : "Send message"}</button>
			</fieldset>
			{sendError && <p className={styles.error} role="alert">{sendError}</p>}
			{sent && <p className={styles.sent} role="status">{sent}</p>}
		</form>
		<div className={styles.controls}>
			<input aria-label="Search messages" placeholder="Search NetID, subject, or message…" value={search} maxLength={500} onChange={event => { setSearch(event.target.value); setPage(1); }} />
			<select aria-label="Viewed status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
				<option value="all">All messages</option><option value="unviewed">Not viewed</option><option value="viewed">Viewed</option>
			</select>
			<button onClick={() => setRefresh(value => value + 1)} disabled={loading}>Refresh</button>
		</div>
		{error && <p className={styles.error} role="alert">{error}</p>}
		{loading ? <p role="status">Loading messages…</p> : !error && <>
			<p>{total} {total === 1 ? "message" : "messages"}</p>
			<div className={styles.table}><table>
				<thead><tr><th>To</th><th>Subject / message</th><th>Color</th><th>Sent (ET)</th><th>Viewed (ET)</th></tr></thead>
				<tbody>{messages.map(message => <tr key={message.id}>
					<td>{message.to}</td><td><strong>{message.subject}</strong>{message.message && <p className={styles.body}>{message.message}</p>}</td>
					<td>{message.color}</td><td><time dateTime={message.timestamp}>{formatTime(message.timestamp)}</time></td>
					<td>{message.viewed_at ? <time dateTime={message.viewed_at}>{formatTime(message.viewed_at)}</time> : "Not viewed"}</td>
				</tr>)}</tbody>
			</table>{!messages.length && <p className={styles.empty}>No messages match your search.</p>}</div>
			<div className={styles.controls}><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
				<span>Page {page} of {Math.max(1, Math.ceil(total / 50))}</span>
				<button disabled={page * 50 >= total} onClick={() => setPage(value => value + 1)}>Next</button></div>
		</>}
	</section>;
}
