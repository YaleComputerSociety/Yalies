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
	return (
		<nav id={styles.navbar}>
			<Link href="/" id={styles.logo} className={logoFont.className} onClick={onLogoClick}>
				<Image width={46} height={46} src="/logo.png" alt="Yalies logo" />
				<h2>Yalies</h2>
			</Link>
			{ middleContent }
			<div id={styles.links}>
				<Link href="/about">About</Link>
				<Link href="/api">API</Link>
				<Link href="/faq">FAQ</Link>
				<ProfileButton isAuthenticated={isAuthenticated} />
			</div>
		</nav>
	);
}
