"use client";

import { useState, useEffect, useCallback } from "react";
import { PIPELINE_API } from "yalies-shared";
import type { PreviewData, ValidationResult } from "@/lib/types";
import Button from "@/components/Button";
import StatsCard from "@/components/StatsCard";
import StudentTable from "@/components/StudentTable";
import ValidationResults from "@/components/ValidationResults";
import styles from "./reviewstep.module.scss";

const API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL ?? "";

export default function ReviewStep({
	onSynced,
}: {
	onSynced: () => void;
}) {
	const [preview, setPreview] = useState<PreviewData | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(true);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncResult, setSyncResult] = useState<string | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);

	useEffect(() => {
		const fetchPreview = async () => {
			setLoadingPreview(true);
			setPreviewError(null);

			try {
				const response = await fetch(`${API_URL}${PIPELINE_API.syncPreview}`, { credentials: "include" });
				if (!response.ok) {
					const text = await response.text();
					throw new Error(`HTTP ${response.status}: ${text}`);
				}
				const data: PreviewData = await response.json();
				setPreview(data);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to load preview.";
				setPreviewError(message);
			} finally {
				setLoadingPreview(false);
			}
		};

		fetchPreview();
	}, []);

	const handleSync = useCallback(async () => {
		setIsSyncing(true);
		setSyncError(null);
		setSyncResult(null);

		try {
			const response = await fetch(`${API_URL}${PIPELINE_API.sync}`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`HTTP ${response.status}: ${text}`);
			}

			const data = await response.json();
			setSyncResult(data.message ?? "Sync completed successfully.");
			onSynced();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Sync failed.";
			setSyncError(message);
		} finally {
			setIsSyncing(false);
		}
	}, [onSynced]);

	if (loadingPreview) {
		return (
			<div className={styles.container}>
				<div className={styles.loading}>Loading preview data...</div>
			</div>
		);
	}

	if (previewError) {
		return (
			<div className={styles.container}>
				<div className={styles.error}>{previewError}</div>
			</div>
		);
	}

	if (!preview) return null;

	return (
		<div className={styles.container}>
			<h3 className={styles.heading}>Review &amp; Sync</h3>

			<div className={styles.statsRow}>
				<StatsCard
					title="New Scraped Data"
					stats={{
						"Total Students": preview.totalStudents,
						"Enriched": preview.enrichedCount,
						"Colleges": preview.colleges,
						"Years": preview.years.join(", "),
					}}
				/>
				<StatsCard
					title="Current Database"
					stats={{
						"Yale College Students": preview.currentDbYcCount,
					}}
				/>
			</div>

			<div className={styles.diffCard}>
				<h4 className={styles.subheading}>What will change</h4>
				<div className={styles.diffRow}>
					<div className={styles.diffAdd}>
						+{preview.diff.toAdd.toLocaleString()} students to add
					</div>
					<div className={styles.diffRemove}>
						-{preview.diff.toRemove.toLocaleString()} students to remove
					</div>
				</div>
			</div>

			{preview.validations && Object.keys(preview.validations).length > 0 && (
				<div className={styles.validationsSection}>
					<h4 className={styles.subheading}>Validations</h4>
					{Object.entries(preview.validations).map(([key, result]) => (
						<div key={key} className={styles.validationGroup}>
							<h5 className={styles.validationLabel}>{key}</h5>
							<ValidationResults result={result as ValidationResult} />
						</div>
					))}
				</div>
			)}

			<div className={styles.tableSection}>
				<h4 className={styles.subheading}>Student Preview (first 50)</h4>
				<StudentTable students={preview.students.slice(0, 50)} />
			</div>

			{syncResult && (
				<div className={styles.syncSuccess}>{syncResult}</div>
			)}

			{syncError && (
				<div className={styles.error}>{syncError}</div>
			)}

			<div className={styles.syncAction}>
				<Button
					variant="primary"
					onClick={handleSync}
					loading={isSyncing}
					disabled={isSyncing || !!syncResult}
				>
					Sync to Database
				</Button>
			</div>
		</div>
	);
}
