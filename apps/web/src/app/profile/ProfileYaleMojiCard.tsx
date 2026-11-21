"use client";

import { useEffect, useState } from "react";
import { API, type UserProfile, type YaleMojiAvatar } from "yalies-shared";
import { API_URL } from "@/consts";
import { subscribeYaleMoji } from "@/hooks/yalemojiCache";
import { invalidateProfileCache } from "@/hooks/useProfileCache";
import { invalidateHomeCache } from "@/hooks/useHomeCache";
import YaleMojiLink from "@/components/YaleMojiLink";
import styles from "./profile.module.scss";

export default function ProfileYaleMojiCard({ profile, onSaved }: { profile: UserProfile | null; onSaved: (profile: UserProfile) => void }) {
	const [avatar, setAvatar] = useState<YaleMojiAvatar | null>(null);
	const [imageFailed, setImageFailed] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const netid = profile?.netid;
	useEffect(() => {
		if(netid) return subscribeYaleMoji(netid, setAvatar);
	}, [netid]);

	useEffect(() => { setImageFailed(false); }, [avatar?.png_url]);

	const toggle = async () => {
		if(!profile || saving) return;
		setSaving(true);
		setMessage("");
		try {
			const response = await fetch(`${API_URL}${API.profileMe}`, {
				method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ show_yalemoji: profile.show_yalemoji === false }),
			});
			if(!response.ok) throw new Error("Could not save Yalemoji visibility.");
			onSaved(await response.json());
			invalidateProfileCache();
			invalidateHomeCache();
			setMessage("Saved.");
		} catch(error) { setMessage((error as Error).message); }
		finally { setSaving(false); }
	};

	return <section className={styles.yalemoji_section} aria-labelledby="yalemoji-heading">
		<h2 id="yalemoji-heading">Your Yalemoji</h2>
		<div className={styles.yalemoji_card}>
			<YaleMojiLink className={styles.yalemoji_preview} href={`https://yalemoji.com/${avatar ? "editor" : "create"}?ref=yalies`} target="_blank" rel="noopener noreferrer"
				style={avatar ? { backgroundImage: `url(${JSON.stringify(avatar.background_url)})` } : undefined}>
				<img src={!imageFailed && avatar?.png_url || "https://www.yalemoji.com/assets/default-avatar.png?v=3"} alt="Your Yalemoji" onError={() => setImageFailed(true)} />
				<span>{avatar ? "Edit your Yalemoji ↗" : "Make your Yalemoji ↗"}</span>
			</YaleMojiLink>
			<label className={styles.yalemoji_toggle}>
				<span>Show my Yalemoji on my Yalies card</span>
				<input type="checkbox" role="switch" checked={profile?.show_yalemoji !== false} onChange={() => void toggle()} disabled={!profile || saving} />
			</label>
			<span role="status" className={styles.discovery_status}>{saving ? "Saving…" : message}</span>
		</div>
	</section>;
}
