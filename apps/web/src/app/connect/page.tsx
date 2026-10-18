"use client";

import { useEffect, useState } from "react";
import { API_URL } from "../../consts";
import styles from "./connect.module.scss";

type Connection = {
	client: { name: string; logo: string | null };
	person: { name: string; school: string | null };
	permissions: string[];
	csrf: string;
};

const messages: Record<string, string> = {
	expired: "This connection has expired. Close this window and start again from the app.",
	invalid: "This connection request isn’t valid. Please start again from the app.",
	access_denied: "Your account isn’t available in the Yalies directory. We couldn’t connect this time.",
	server: "We couldn’t connect right now. Please close this window and try again.",
};

export default function ConnectPage() {
	const [connection, setConnection] = useState<Connection>();
	const [interaction, setInteraction] = useState("");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const uid = params.get("interaction");
		if(params.has("error") || !uid || !/^[A-Za-z0-9_-]{20,128}$/.test(uid)) {
			setError(params.get("error") || "invalid");
			return;
		}
		setInteraction(uid);
		const controller = new AbortController();
		async function load() {
			try {
				const response = await fetch(`${API_URL}/oauth/interaction/${uid}/details`, { credentials: "include", cache: "no-store", signal: controller.signal });
				if(response.status === 401) {
					window.location.replace(`${API_URL}/oauth/interaction/${uid}`);
					return;
				}
				const data = await response.json();
				if(!response.ok) setError(data.error || "server");
				else setConnection(data);
			} catch {
				if(!controller.signal.aborted) setError("server");
			}
		}
		void load();
		return () => controller.abort();
	}, []);

	return (
		<main className={styles.page}>
			<section className={styles.card} aria-labelledby="connect-title" aria-busy={!error && !connection || submitting}>
				<div className={styles.brand}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/logo.png" width="36" height="36" alt="" />
					<span>Yalies</span>
				</div>
				{error ? (
					<div role="alert" className={styles.message}>
						<h1 id="connect-title">Unable to connect</h1>
						<p>{messages[error] || messages.invalid}</p>
					</div>
				) : !connection ? (
					<div role="status" className={styles.message}>
						<h1 id="connect-title">Getting things ready</h1>
						<p>Checking your Yalies connection…</p>
					</div>
				) : (
					<>
						{connection.client.logo && (
							// eslint-disable-next-line @next/next/no-img-element
							<img className={styles.appLogo} src={connection.client.logo} width="40" height="40" alt="" referrerPolicy="no-referrer" />
						)}
						<h1 id="connect-title">Connect to {connection.client.name}</h1>
						<p className={styles.subtitle}>Use your Yalies account to continue to {connection.client.name}.</p>
						<div className={styles.identity}>
							<span className={styles.avatar} aria-hidden="true">{connection.person.name.slice(0, 1)}</span>
							<div><strong>{connection.person.name}</strong>{connection.person.school && <p>{connection.person.school}</p>}</div>
						</div>
						<div className={styles.permissions}>
							<p>{connection.client.name} will receive:</p>
							<ul>{connection.permissions.map(permission => <li key={permission}><span aria-hidden="true">✓</span>{permission}</li>)}</ul>
						</div>
						<form action={`${API_URL}/oauth/interaction/${interaction}`} method="post" onSubmit={event => { if(submitting) event.preventDefault(); else setSubmitting(true); }}>
							<input type="hidden" name="csrf" value={connection.csrf} />
							<button className={styles.continue} type="submit" name="action" value="continue" aria-disabled={submitting}>{submitting ? "Connecting…" : "Continue"}</button>
							<button className={styles.cancel} type="submit" name="action" value="cancel" aria-disabled={submitting}>Cancel</button>
						</form>
					</>
				)}
				<p className={styles.footer}>Your Yale community. One connection.</p>
			</section>
		</main>
	);
}
