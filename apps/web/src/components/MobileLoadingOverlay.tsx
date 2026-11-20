"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./mobileloadingoverlay.module.scss";

const MINIMUM_DURATION = 500;
const MAXIMUM_DURATION = 3000;
const FADE_DURATION = 180;

export default function MobileLoadingOverlay({ ready }: { ready: boolean }) {
	const [minimumElapsed, setMinimumElapsed] = useState(false);
	const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");

	useEffect(() => {
		if (window.innerWidth > 1024) {
			setPhase("hidden");
			return;
		}
		const minimum = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_DURATION);
		const deadline = window.setTimeout(() => {
			setPhase((current) => current === "visible" ? "leaving" : current);
		}, MAXIMUM_DURATION - FADE_DURATION);
		const maximum = window.setTimeout(() => setPhase("hidden"), MAXIMUM_DURATION);
		return () => {
			window.clearTimeout(minimum);
			window.clearTimeout(deadline);
			window.clearTimeout(maximum);
		};
	}, []);

	useEffect(() => {
		if (ready && minimumElapsed) setPhase((current) => current === "visible" ? "leaving" : current);
	}, [ready, minimumElapsed]);

	useEffect(() => {
		if (phase !== "leaving") return;
		const fade = window.setTimeout(() => setPhase("hidden"), FADE_DURATION);
		return () => window.clearTimeout(fade);
	}, [phase]);

	if (phase === "hidden") return null;

	return (
		<div
			className={`${styles.overlay} ${phase === "leaving" ? styles.leaving : ""}`}
			role="status"
			aria-label="Loading Yalies"
		>
			<Image src="/logo.svg" alt="" width={80} height={80} priority />
		</div>
	);
}
