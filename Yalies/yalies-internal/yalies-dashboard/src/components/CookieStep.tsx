"use client";

import { useState, useCallback } from "react";
import { PIPELINE_API } from "yalies-shared";
import Button from "@/components/Button";
import styles from "./cookiestep.module.scss";

const API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL ?? "";

export default function CookieStep({
	targetUrl,
	cookieName,
	cookieLabel,
	cookieType,
	onValidated,
}: {
	targetUrl: string;
	cookieName: string;
	cookieLabel: string;
	cookieType: "facebook" | "directory";
	onValidated: (cookie: string) => void;
}) {
	const [cookieValue, setCookieValue] = useState("");
	const [isValidating, setIsValidating] = useState(false);
	const [validationMessage, setValidationMessage] = useState<string | null>(null);
	const [validationSuccess, setValidationSuccess] = useState(false);
	const [iframeError, setIframeError] = useState(false);

	const handleValidate = useCallback(async () => {
		if (!cookieValue.trim()) return;

		setIsValidating(true);
		setValidationMessage(null);
		setValidationSuccess(false);

		try {
			const response = await fetch(`${API_URL}${PIPELINE_API.cookieValidate}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: cookieType,
					cookie: cookieValue.trim(),
				}),
			});

			if (!response.ok) {
				setValidationMessage("Server error: " + response.statusText);
				setValidationSuccess(false);
				return;
			}

			const data = await response.json();

			if (response.ok && data.valid) {
				setValidationMessage("Cookie validated successfully.");
				setValidationSuccess(true);
				onValidated(cookieValue.trim());
			} else {
				setValidationMessage(data.message ?? "Cookie validation failed.");
				setValidationSuccess(false);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Validation request failed.";
			setValidationMessage(message);
			setValidationSuccess(false);
		} finally {
			setIsValidating(false);
		}
	}, [cookieValue, cookieType, onValidated]);

	return (
		<div className={styles.container}>
			<div className={styles.instructions}>
				<h3 className={styles.heading}>Get your {cookieLabel} cookie</h3>
				<ol className={styles.steps}>
					<li>Open the website below (or in a new tab if the embed is blocked).</li>
					<li>Log in with your Yale credentials if not already logged in.</li>
					{cookieType === "facebook" && (
						<li><strong>Important:</strong> Select <strong>&quot;Yale&quot;</strong> from the college dropdown in the top navigation bar. This ensures all students are loaded.</li>
					)}
					<li>Open your browser developer tools (F12 or Cmd+Option+I on Mac).</li>
					<li>Go to the <strong>Application</strong> tab, then <strong>Cookies</strong>, then click on the site domain.</li>
					<li>
						Find the cookie named <code className={styles.code}>{cookieName}</code> and copy its value.
					</li>
					<li>Paste the cookie value in the input below and click Validate.</li>
				</ol>
			</div>

			<div className={styles.iframeContainer}>
				{!iframeError ? (
					<iframe
						src={targetUrl}
						className={styles.iframe}
						title={`${cookieLabel} login`}
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
						onError={() => setIframeError(true)}
					/>
				) : (
					<div className={styles.iframeFallback}>
						<p>This website cannot be embedded due to security restrictions.</p>
					</div>
				)}
				<a
					href={targetUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.fallbackLink}
				>
					Open in new tab
				</a>
			</div>

			<div className={styles.inputSection}>
				<label htmlFor="cookie-input" className={styles.inputLabel}>
					{cookieName} cookie value
				</label>
				<input
					id="cookie-input"
					type="text"
					className={styles.input}
					value={cookieValue}
					onChange={(e) => setCookieValue(e.target.value)}
					placeholder={`Paste your ${cookieName} cookie here...`}
				/>
				<Button
					variant="primary"
					onClick={handleValidate}
					disabled={!cookieValue.trim()}
					loading={isValidating}
				>
					Validate Cookie
				</Button>
			</div>

			{validationMessage && (
				<div
					className={`${styles.validationResult} ${
						validationSuccess ? styles.validationSuccess : styles.validationError
					}`}
				>
					{validationMessage}
				</div>
			)}
		</div>
	);
}
