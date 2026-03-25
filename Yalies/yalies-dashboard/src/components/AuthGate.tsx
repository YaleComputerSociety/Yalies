"use client";

import { useAuth } from "./AuthProvider";

const SCRAPER_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL || "";

export default function AuthGate() {
	const { state, netid } = useAuth();

	if (state !== "authenticated") return null;

	return (
		<>
			<span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8125rem" }}>
				{netid}
			</span>
			<a href={SCRAPER_URL + "/api/auth/logout"}>Logout</a>
		</>
	);
}
