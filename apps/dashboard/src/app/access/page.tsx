"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PIPELINE_API } from "yalies-shared";
import { useAuth } from "@/components/AuthProvider";
import styles from "./access.module.scss";

const API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL ?? "";
type Admin = { netid: string; added_at: string };

async function responseError(response: Response): Promise<string> {
	const text = await response.text();
	try { return JSON.parse(text).error || "Request failed"; } catch { return text || "Request failed"; }
}

export default function AccessPage() {
	const { netid: currentNetid } = useAuth();
	const [admins, setAdmins] = useState<Admin[]>([]);
	const [netid, setNetid] = useState("");
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	const load = useCallback(async () => {
		const response = await fetch(`${API_URL}${PIPELINE_API.admins}`, { credentials: "include", cache: "no-store" });
		if (!response.ok) throw new Error(await responseError(response));
		setAdmins((await response.json()).admins);
	}, []);

	useEffect(() => {
		load().catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
	}, [load]);

	const add = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError("");
		setNotice("");
		try {
			const response = await fetch(`${API_URL}${PIPELINE_API.admins}`, {
				method: "POST", credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ netid }),
			});
			if (!response.ok) throw new Error(await responseError(response));
			const admin: Admin = await response.json();
			await load();
			setNetid("");
			setNotice(`${admin.netid} can now access the dashboard.`);
		} catch (err) { setError(err instanceof Error ? err.message : "Could not grant access"); }
		finally { setBusy(false); }
	};

	const remove = async (admin: Admin) => {
		if (!window.confirm(`Remove dashboard access for ${admin.netid}?`)) return;
		setBusy(true);
		setError("");
		setNotice("");
		try {
			const response = await fetch(`${API_URL}${PIPELINE_API.admin(admin.netid)}`, { method: "DELETE", credentials: "include" });
			if (!response.ok) throw new Error(await responseError(response));
			await load();
			setNotice(`Dashboard access removed for ${admin.netid}.`);
		} catch (err) { setError(err instanceof Error ? err.message : "Could not remove access"); }
		finally { setBusy(false); }
	};

	return (
		<section className={styles.page}>
			<h1>Dashboard access</h1>
			<p>Only the Yale NetIDs listed here can use this dashboard. Every admin can review photos, edit data, and manage access.</p>
			{error && <p className={styles.error} role="alert">{error}</p>}
			{notice && <p className={styles.notice} role="status">{notice}</p>}
			<form className={styles.card} onSubmit={add}>
				<label htmlFor="admin-netid">Grant access to a Yale NetID</label>
				<div className={styles.formRow}>
					<input id="admin-netid" value={netid} onChange={(event) => setNetid(event.target.value)}
						required maxLength={32} pattern="[A-Za-z][A-Za-z0-9]*" placeholder="e.g. yef3" autoCapitalize="none" autoCorrect="off" disabled={busy} />
					<button disabled={busy || loading} type="submit">Grant access</button>
				</div>
				<p>They will sign in with their own Yale account.</p>
			</form>
			<div className={styles.card}>
				<h2>Admins</h2>
				{loading ? <p role="status">Loading access list...</p> : (
					<ul className={styles.list}>
						{admins.map((admin) => (
							<li key={admin.netid}>
								<div><strong>{admin.netid}</strong>{admin.netid === currentNetid && <span> (you)</span>}
									<p>Added {new Date(admin.added_at).toLocaleDateString()}</p>
								</div>
								<button className={styles.remove} disabled={busy || admin.netid === currentNetid}
									onClick={() => remove(admin)} aria-label={`Remove access for ${admin.netid}`}>Remove</button>
							</li>
						))}
					</ul>
				)}
				<p className={styles.hint}>You cannot remove your own access. Removing someone blocks their next dashboard request, even if they are already signed in.</p>
			</div>
		</section>
	);
}
