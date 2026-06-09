"use client";
import { API_URL } from "@/consts";

import styles from "./profilebutton.module.scss";
import Link from "next/link";
import { prefetchProfile } from "@/hooks/useProfileCache";
import { API } from "yalies-shared";

export default function ProfileButton({
	isAuthenticated,
}: {
	isAuthenticated?: boolean;
}) {
	if (isAuthenticated) {
		return (
			<Link
				href="/profile"
				className={styles.profile_link}
				onMouseEnter={() => prefetchProfile()}
			>
				Profile
			</Link>
		);
	}

	return (
		<a href={API_URL + API.login} className={styles.profile_link}>
			Log in
		</a>
	);
}
