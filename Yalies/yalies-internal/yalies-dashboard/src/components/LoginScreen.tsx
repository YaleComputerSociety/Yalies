"use client";

import { useAuth } from "./AuthProvider";
import styles from "./loginscreen.module.scss";
import { PIPELINE_API } from "yalies-shared";

const SCRAPER_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL || "";

export default function LoginScreen() {
	const { state } = useAuth();

	if (state === "loading") {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.spinner} />
					<p className={styles.text}>Checking authentication...</p>
				</div>
			</div>
		);
	}

	if (state === "forbidden") {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<h1 className={styles.title}>Access Denied</h1>
					<p className={styles.text}>
						You are not authorized to access the dashboard.
						Only admins can use this tool.
					</p>
					<a href={SCRAPER_URL + PIPELINE_API.authLogout} className={styles.link}>
						Sign out
					</a>
				</div>
			</div>
		);
	}

	// unauthenticated — same pattern as yalies-web Splash.tsx
	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<h1 className={styles.title}>Yalies Dashboard</h1>
				<p className={styles.text}>
					Sign in with your Yale NetID to continue.
				</p>
				<a href={SCRAPER_URL + PIPELINE_API.auth} className={styles.loginButton}>
					Log in with CAS
				</a>
			</div>
		</div>
	);
}
