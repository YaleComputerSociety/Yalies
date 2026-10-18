"use client";

import Link from "next/link";

import { ReactNode } from "react";
import mainStyle from "../app/main.module.scss";
import AuthProvider, { useAuth } from "./AuthProvider";
import AuthGate from "./AuthGate";
import LoginScreen from "./LoginScreen";

function LayoutInner({ children }: { children: ReactNode }) {
	const { state } = useAuth();

	return (
		<>
			<header className={mainStyle.header}>
				<span className={mainStyle.headerTitle}>Yalies Dashboard</span>
				<nav className={mainStyle.headerNav}>
					<Link href="/">Pipeline</Link>
					<Link href="/database">Database</Link>
					<AuthGate />
				</nav>
			</header>
			<main className={mainStyle.content}>
				{state === "authenticated" ? children : <LoginScreen />}
			</main>
		</>
	);
}

export default function ClientLayout({ children }: { children: ReactNode }) {
	return (
		<AuthProvider>
			<LayoutInner>{children}</LayoutInner>
		</AuthProvider>
	);
}
