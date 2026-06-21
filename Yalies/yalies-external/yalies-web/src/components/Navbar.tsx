"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./navbar.module.scss";
import { Lexend_Deca } from "next/font/google";
import { API } from "yalies-shared";
import { API_URL } from "@/consts";
import ThemeToggle from "./ThemeToggle";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function Navbar({
	middleContent,
	isAuthenticated,
	onLogoClick,
}: {
	middleContent?: React.ReactNode;
	isAuthenticated?: boolean;
	onLogoClick?: () => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const profileHref = isAuthenticated ? "/profile" : API_URL + API.login;
	const authHref = isAuthenticated ? API_URL + API.logout : API_URL + API.login;

	return (
		<nav id={styles.navbar}>
			<div className={styles.navbar_top}>
				<Link href="/" id={styles.logo} className={logoFont.className} onClick={onLogoClick}>
					<Image width={46} height={46} src="/logo.png" alt="Yalies logo" />
					<h2>Yalies</h2>
				</Link>
				{middleContent && (
					<div className={styles.navbar_middle}>
						{middleContent}
					</div>
				)}
				<div className={styles.nav_actions}>
					<ThemeToggle />
					<Link href={profileHref} className={styles.my_card}>
						{isAuthenticated ? "My Card" : "Log in"}
					</Link>
					<Link href="/community" className={styles.grid_link} aria-label="Community">
						<span className={styles.apps_icon} aria-hidden="true" />
					</Link>
					<div className={styles.account_menu}>
						<button
							className={styles.account_button}
							aria-label="Open account menu"
							aria-expanded={menuOpen}
							onClick={() => setMenuOpen(!menuOpen)}
						/>
					</div>
				</div>
			</div>
			{menuOpen && (
				<div className={styles.dropdown}>
					<Link href="/about" onClick={() => setMenuOpen(false)}>About</Link>
					<Link href="/api" onClick={() => setMenuOpen(false)}>API</Link>
					<Link href="/faq" onClick={() => setMenuOpen(false)}>FAQ</Link>
					<a href={authHref}>{isAuthenticated ? "Log out" : "Log in"}</a>
				</div>
			)}
		</nav>
	);
}
