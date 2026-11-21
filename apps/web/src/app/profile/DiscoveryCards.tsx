"use client";

import { useCallback, useEffect, useState } from "react";
import { API, accountSetupFinished, type AccountSetup, type DiscoveryStats } from "yalies-shared";
import { API_URL } from "@/consts";
import { useProfileSetup } from "@/components/ProfileSetupProvider";
import Button from "@/components/Button";
import styles from "./profile.module.scss";

export default function DiscoveryCards() {
	const openSetup = useProfileSetup();
	const [hasAvatar, setHasAvatar] = useState<boolean | null>(null);
	const [stats, setStats] = useState<DiscoveryStats | null>(null);
	const [hideFinishButton, setHideFinishButton] = useState(false);
	const [locked, setLocked] = useState(false);
	const [error, setError] = useState("");
	const load = useCallback(async () => {
		try {
			const [response, setupResponse] = await Promise.all([
				fetch(`${API_URL}${API.profileMeDiscoveryStats}`, { credentials: "include", cache: "no-store" }),
				fetch(`${API_URL}${API.profileMeSetup}`, { credentials: "include", cache: "no-store" }),
			]);
			if(setupResponse.ok) {
				const setup: AccountSetup = await setupResponse.json();
				setHideFinishButton(accountSetupFinished(setup));
				setHasAvatar(setup.yalemoji_set);
			} else setHideFinishButton(false);
			if(response.status === 403) { setLocked(true); setStats(null); setError(""); return; }
			if(!response.ok) throw new Error("Could not load discovery insights. Please try again.");
			setStats(await response.json()); setLocked(false); setError("");
		} catch(err) { setError((err as Error).message); }
	}, []);
	useEffect(() => {
		void load();
		const refresh = () => { void load(); };
		window.addEventListener("discovery-profile-updated", refresh);
		return () => window.removeEventListener("discovery-profile-updated", refresh);
	}, [load]);

	if(hasAvatar !== true) return hasAvatar === false || error ? <section className={styles.stats_expanded}>
		{!hideFinishButton && <Button onClick={() => openSetup(() => {}, true)}>Finish your profile</Button>}
		{error && <p role="alert" className={styles.field_error}>{error} <button type="button" onClick={() => void load()}>Try again</button></p>}
	</section> : null;
	const noInsights = !locked && stats !== null && stats.searches_this_week <= 1;

	return <section className={`${styles.stats_section} ${styles.stats_expanded}`} aria-labelledby="discovery-stats-heading">
		<h2 id="discovery-stats-heading">Discovery insights</h2>
		<div className={styles.stats_card}>
			{noInsights ? <p>No insights for now</p> : <>
				<p>You appeared in</p>
				{locked ? <strong className={`${styles.stat_number} ${styles.blurred_stat}`} aria-hidden="true">00</strong>
					: <strong className={styles.stat_number}>{stats ? stats.searches_this_week.toLocaleString() : "…"}</strong>}
				<p>searches this week</p>
			</>}
			{locked && <div className={styles.stats_lock}>
				<p>Finish your profile to unlock discovery insights.</p>
			</div>}
			{stats && !locked && !noInsights && <span className={styles.stats_caption}>Last 7 days · excludes your own searches</span>}
			{!hideFinishButton && <Button onClick={() => openSetup(() => {}, true)}>Finish your profile</Button>}
			{error && <p role="alert" className={styles.field_error}>{error} <button type="button" onClick={() => void load()}>Try again</button></p>}
		</div>
	</section>;
}
