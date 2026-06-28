"use client";
import { API_URL } from "@/consts";

import styles from "./profilebutton.module.scss";
import Link from "next/link";
import { getProfile, prefetchProfile } from "@/hooks/useProfileCache";
import { API, Person } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faAddressBook, faArrowRightFromBracket, faCircleInfo, faCode, faQuestionCircle, faRightToBracket, faUser } from "@fortawesome/free-solid-svg-icons";
import { FaRegMoon } from "react-icons/fa";
import { FiSmile } from "react-icons/fi";
import { ImSun } from "react-icons/im";
import { useEffect, useMemo, useRef, useState } from "react";

const YALEMOJI_URL = "https://yalemoji.com?ref=yalies";
const THEME_STORAGE_KEY = "yalies-theme";
type Theme = "light" | "dark";

function getFirstName(person: Person | null) {
	return person?.preferred_name?.trim() || person?.first_name?.trim() || "";
}

function DropdownItem({
	href,
	children,
	icon,
	iconClassName,
	onClick,
	external,
}: {
	href?: string;
	children: React.ReactNode;
	icon: IconProp;
	iconClassName?: string;
	onClick?: () => void;
	external?: boolean;
}) {
	const content = (
		<>
			<FontAwesomeIcon icon={icon} className={[styles.item_icon, iconClassName].filter(Boolean).join(" ")} />
			<span>{children}</span>
		</>
	);

	if(onClick) {
		return (
			<button type="button" className={styles.dropdown_item} onClick={onClick}>
				{content}
			</button>
		);
	}

	return (
		<Link
			href={href || "/"}
			className={styles.dropdown_item}
			{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
		>
			{content}
		</Link>
	);
}

export default function ProfileButton({
	isAuthenticated,
	showCompactNavLinks,
}: {
	isAuthenticated?: boolean;
	showCompactNavLinks?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [person, setPerson] = useState<Person | null>(null);
	const [theme, setTheme] = useState<Theme>("light");
	const wrapperRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
		const initialTheme: Theme = storedTheme === "dark" ? "dark" : "light";
		document.documentElement.dataset.theme = initialTheme;
		setTheme(initialTheme);
	}, []);

	const toggleTheme = () => {
		const nextTheme: Theme = theme === "dark" ? "light" : "dark";
		document.documentElement.dataset.theme = nextTheme;
		window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
		setTheme(nextTheme);
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if(wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if(!isAuthenticated) return;
		getProfile().then((result) => {
			if(result?.person) setPerson(result.person);
		});
	}, [isAuthenticated]);

	const initials = useMemo(() => {
		const first = getFirstName(person);
		const last = person?.last_name?.trim() || "";
		if(first && last) return `${first[0]}${last[0]}`.toUpperCase();
		if(first) return first.slice(0, 2).toUpperCase();
		return "ME";
	}, [person]);

	const firstName = getFirstName(person);

	if (isAuthenticated) {
		return (
			<div className={styles.profile_wrapper} ref={wrapperRef}>
				<button
					type="button"
					className={styles.profile_button}
					onMouseEnter={() => prefetchProfile()}
					onClick={() => setOpen(!open)}
					aria-label="Profile menu"
					aria-expanded={open}
				>
					<span>{initials}</span>
				</button>
				{open && (
					<div className={styles.dropdown}>
						<div className={styles.identity_header}>
							<button
								type="button"
								className={`${styles.theme_toggle} ${theme === "dark" ? styles.dark : ""}`}
								onClick={toggleTheme}
								aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
								aria-pressed={theme === "dark"}
								title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
							>
								<ImSun size={17} />
								<FaRegMoon size={16} className={styles.moon_icon} />
							</button>
							<a
								className={styles.header_edit}
								href={YALEMOJI_URL}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Build your YaleMoji"
							>
								<FiSmile size={17} strokeWidth={1.7} />
							</a>
							<div className={styles.header_initials}>{initials}</div>
							{firstName && <span className={styles.greeting}>Hello, {firstName}</span>}
						</div>
						<div className={styles.menu_items}>
							{showCompactNavLinks && (
								<div className={styles.compact_nav_items}>
									<DropdownItem href="/" icon={faAddressBook}>Directory</DropdownItem>
									<DropdownItem href="/profile" icon={faUser}>Profile</DropdownItem>
								</div>
							)}
							<DropdownItem href="/about" icon={faCircleInfo}>About</DropdownItem>
							<DropdownItem href="/faq" icon={faQuestionCircle} iconClassName={styles.icon_purple}>FAQ</DropdownItem>
							<DropdownItem href="/api" icon={faCode} iconClassName={styles.icon_orange}>API</DropdownItem>
							<DropdownItem
								icon={faArrowRightFromBracket}
								iconClassName={styles.icon_red}
								onClick={() => {
									window.location.href = API_URL + API.logout;
								}}
							>
								Sign out
							</DropdownItem>
						</div>
					</div>
				)}
			</div>
		);
	}

	return (
		<a href={API_URL + API.login} className={styles.login_button}>
			<FontAwesomeIcon icon={faRightToBracket} />
			Log in
		</a>
	);
}
