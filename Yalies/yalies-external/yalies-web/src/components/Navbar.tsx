"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./navbar.module.scss";
import { Lexend_Deca } from "next/font/google";
import ProfileButton from "./ProfileButton";
import AppsDropdown from "./AppsDropdown";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function Navbar({
	middleContent,
	isAuthenticated,
	onLogoClick,
	onFeelingLucky,
}: {
	middleContent?: React.ReactNode;
	isAuthenticated?: boolean;
	onLogoClick?: () => void;
	onFeelingLucky?: () => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const pathname = usePathname();
	const directoryActive = pathname === "/";
	const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");
	const useCompactTopNav = !middleContent && pathname !== "/";
	const topNavClassName = useCompactTopNav ? `${styles.navbar_top} ${styles.navbar_top_compact}` : styles.navbar_top;

	return (
		<nav id={styles.navbar}>
			<div className={topNavClassName}>
				<div className={styles.logo_wrapper}>
					<Link href="/" id={styles.logo} className={logoFont.className} onClick={onLogoClick}>
						<Image width={46} height={46} src="/logo.png" alt="Yalies logo" />
						<h2>Yalies</h2>
					</Link>
					{onFeelingLucky && (
						<button
							type="button"
							className={styles.random_button}
							onClick={onFeelingLucky}
						>
							I&apos;m feeling lucky
						</button>
					)}
				</div>
				{middleContent && (
					<div className={styles.middle_content}>
						{middleContent}
					</div>
				)}
				<div id={styles.links}>
					<div className={styles.nav_text_links}>
						<Link href="/" className={directoryActive ? styles.active_nav_button : undefined}>Directory</Link>
						<Link href="/profile" className={profileActive ? styles.active_nav_button : undefined}>Profile</Link>
					</div>
					<div className={styles.account_controls}>
						<AppsDropdown />
						<ProfileButton isAuthenticated={isAuthenticated} showCompactNavLinks />
					</div>
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
					<Link
						href="/"
						className={directoryActive ? styles.active_nav_button : undefined}
						onClick={() => setMenuOpen(false)}
					>
						Directory
					</Link>
					<Link
						href="/profile"
						className={profileActive ? styles.active_nav_button : undefined}
						onClick={() => setMenuOpen(false)}
					>
						Profile
					</Link>
					<ProfileButton isAuthenticated={isAuthenticated} showCompactNavLinks />
				</div>
			)}
		</nav>
	);
}
