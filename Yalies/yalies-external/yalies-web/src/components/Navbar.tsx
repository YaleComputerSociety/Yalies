"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./navbar.module.scss";
import { Lexend_Deca } from "next/font/google";
import ProfileButton from "./ProfileButton";

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

	return (
		<nav id={styles.navbar}>
			<div className={styles.navbar_top}>
				<Link href="/" id={styles.logo} className={logoFont.className} onClick={onLogoClick}>
					<Image width={46} height={46} src="/logo.png" alt="Yalies logo" />
					<h2>Yalies</h2>
				</Link>
				{ middleContent }
				<div id={styles.links}>
					<Link href="/">Home</Link>
					<Link href="/community">Community</Link>
					<Link href="/about">About</Link>
					<ProfileButton isAuthenticated={isAuthenticated} />
				</div>
				<button
					className={styles.hamburger}
					onClick={() => setMenuOpen(!menuOpen)}
					aria-label="Toggle menu"
				>
					<span className={`${styles.hamburger_line} ${menuOpen ? styles.open : ""}`} />
					<span className={`${styles.hamburger_line} ${menuOpen ? styles.open : ""}`} />
					<span className={`${styles.hamburger_line} ${menuOpen ? styles.open : ""}`} />
				</button>
			</div>
			{menuOpen && (
				<div className={styles.mobile_menu}>
					<Link href="/" onClick={() => setMenuOpen(false)}>Home</Link>
					<Link href="/community" onClick={() => setMenuOpen(false)}>Community</Link>
					<Link href="/about" onClick={() => setMenuOpen(false)}>About</Link>
					<ProfileButton isAuthenticated={isAuthenticated} />
				</div>
			)}
		</nav>
	);
}
