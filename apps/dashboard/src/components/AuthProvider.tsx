"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { PIPELINE_API } from "yalies-shared";

type AuthState = "loading" | "authenticated" | "unauthenticated" | "forbidden";

interface AuthContextValue {
	state: AuthState;
	netid: string | null;
}

const AuthContext = createContext<AuthContextValue>({
	state: "loading",
	netid: null,
});

export function useAuth() {
	return useContext(AuthContext);
}

const SCRAPER_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL || "";

export default function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>("loading");
	const [netid, setNetid] = useState<string | null>(null);

	useEffect(() => {

		const params = new URLSearchParams(window.location.search);
		const error = params.get("error");
		if (error === "not_admin") {
			setState("forbidden");
			window.history.replaceState({}, "", window.location.pathname);
			return;
		}

		const checkAuth = async () => {
			try {
				const res = await fetch(`${SCRAPER_URL}${PIPELINE_API.authMe}`, { credentials: "include" });
				if (res.status === 401) {
					setState("unauthenticated");
					return;
				}
				if (res.status === 403) {
					setState("forbidden");
					return;
				}
				if (!res.ok) {
					setState("unauthenticated");
					return;
				}
				const data = await res.json();
				if (data.authenticated && data.isAdmin) {
					setState("authenticated");
					setNetid(data.netid);
				} else if (data.authenticated && !data.isAdmin) {
					setState("forbidden");
				} else {
					setState("unauthenticated");
				}
			} catch {
				setState("unauthenticated");
			}
		};
		checkAuth();
	}, []);

	return (
		<AuthContext.Provider value={{ state, netid }}>
			{children}
		</AuthContext.Provider>
	);
}
