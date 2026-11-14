"use client";

import { useEffect, useState } from "react";
import { getProfile } from "@/hooks/useProfileCache";
import { subscribeYaleMojiBanner } from "@/hooks/yalemojiCache";
import YaleMojiLink from "./YaleMojiLink";
import styles from "./yalemojibanner.module.scss";

export default function YaleMojiBanner({ isAuthenticated }: { isAuthenticated?: boolean }) {
	const [loaded, setLoaded] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		let frame: number;
		const onLoad = () => { frame = requestAnimationFrame(() => setLoaded(true)); };
		if(document.readyState === "complete") onLoad();
		else window.addEventListener("load", onLoad, { once: true });
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("load", onLoad);
		};
	}, []);

	useEffect(() => {
		setVisible(false);
		if(!isAuthenticated) return;
		let active = true;
		let unsubscribe: (() => void) | undefined;
		void getProfile().then(result => {
			if(!active || !result) return;
			unsubscribe = subscribeYaleMojiBanner(result.profile.netid, setVisible);
		});
		return () => {
			active = false;
			unsubscribe?.();
		};
	}, [isAuthenticated]);

	const open = !!isAuthenticated && loaded && visible;
	return (
		<div className={styles.banner} data-open={open} aria-hidden={!open}>
			<div className={styles.clip}>
				<div className={styles.content}>
					<YaleMojiLink className={styles.link} href="https://yalemoji.com/create?ref=yalies" target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}>
						<span className={styles.description}>Your personalized Yale avatar</span>
						<span className={styles.action}>Make your Yalemoji <span aria-hidden="true">↗</span></span>
					</YaleMojiLink>
				</div>
			</div>
		</div>
	);
}
