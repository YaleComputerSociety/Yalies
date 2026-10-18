"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import useSSE from "@/hooks/useSSE";
import Button from "@/components/Button";
import ProgressBar from "@/components/ProgressBar";
import StatsCard from "@/components/StatsCard";
import ValidationResults from "@/components/ValidationResults";
import type { ValidationResult } from "@/lib/types";
import styles from "./scrapestep.module.scss";

const API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL ?? "";

function formatElapsed(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ScrapeStep({
	endpoint,
	cookie,
	label,
	onComplete,
}: {
	endpoint: string;
	cookie: string;
	label: string;
	onComplete: () => void;
}) {
	const [elapsed, setElapsed] = useState(0);
	const [startTime, setStartTime] = useState<number | null>(null);
	const [hasCompleted, setHasCompleted] = useState(false);

	const body = useMemo(() => ({ cookie }), [cookie]);
	const { start, stop, latestEvent, isRunning, error } = useSSE(
		`${API_URL}${endpoint}`,
		body,
	);

	useEffect(() => {
		let timer: ReturnType<typeof setInterval>;
		if (isRunning) {
			setStartTime(Date.now());
			setElapsed(0);
			timer = setInterval(() => {
				setElapsed((prev) => prev + 1);
			}, 1000);
		}
		return () => clearInterval(timer);
	}, [isRunning]);

	useEffect(() => {
		if (latestEvent?.type === "complete" && !hasCompleted) {
			setHasCompleted(true);
			onComplete();
		}
	}, [latestEvent, hasCompleted, onComplete]);

	const handleStart = useCallback(() => {
		setHasCompleted(false);
		start();
	}, [start]);

	const current = latestEvent?.count ?? 0;
	const total = latestEvent?.total ?? 0;
	const estimatedRemaining =
		current > 0 && total > 0 && elapsed > 0
			? Math.round(((total - current) / current) * elapsed)
			: null;

	return (
		<div className={styles.container}>
			<h3 className={styles.heading}>{label}</h3>

			{!isRunning && !hasCompleted && (
				<Button variant="primary" onClick={handleStart}>
					Start Scrape
				</Button>
			)}

			{isRunning && (
				<Button variant="secondary" onClick={stop}>
					Cancel
				</Button>
			)}

			{error && (
				<div className={styles.error}>
					<strong>Error:</strong> {error}
				</div>
			)}

			{(isRunning || hasCompleted) && (
				<div className={styles.progress}>
					<ProgressBar current={current} total={total} label="Progress" />
					<div className={styles.meta}>
						<span>Elapsed: {formatElapsed(elapsed)}</span>
						{estimatedRemaining !== null && isRunning && (
							<span>Est. remaining: {formatElapsed(estimatedRemaining)}</span>
						)}
					</div>
					{latestEvent?.message && (
						<div className={styles.status}>{latestEvent.message}</div>
					)}
				</div>
			)}

			{hasCompleted && latestEvent?.stats && (
				<StatsCard
					title="Scrape Summary"
					stats={latestEvent.stats as Record<string, string | number>}
				/>
			)}

			{hasCompleted && latestEvent?.validation && (
				<div className={styles.validationSection}>
					<h4 className={styles.subheading}>Validation</h4>
					<ValidationResults result={latestEvent.validation as ValidationResult} />
				</div>
			)}
		</div>
	);
}
