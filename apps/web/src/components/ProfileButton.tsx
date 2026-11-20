"use client";
import { API_URL } from "@/consts";

import styles from "./profilebutton.module.scss";
import Link from "next/link";
import { usePathname } from "next/navigation";
import YaleMojiLink from "./YaleMojiLink";
import { getProfile, prefetchProfile, invalidateProfileCache } from "@/hooks/useProfileCache";
import { clearYaleMojiCache, subscribeYaleMoji } from "@/hooks/yalemojiCache";
import { API, Person, YaleMojiAvatar } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faAddressBook, faArrowRightFromBracket, faCircleInfo, faCode, faQuestionCircle, faRightToBracket, faUser } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PROFILE_IDENTITY_STORAGE_KEY = "yalies-profile-identity";
const PROFILE_IDENTITY_CACHE_VERSION = 2;
const DROPDOWN_ANIMATION_MS = 180;
type CachedProfileIdentity = {
	initials: string;
	firstName: string;
	version: number;
};

function getFirstName(person: Person | null) {
	return person?.preferred_name?.trim() || person?.first_name?.trim() || person?.netid?.trim() || "";
}

function getInitials(person: Person | null) {
	const first = getFirstName(person);
	const last = person?.last_name?.trim() || "";
	if(first && last) return `${first[0]}${last[0]}`.toUpperCase();
	if(first) return first.slice(0, 2).toUpperCase();
	return "";
}

function getProfileIdentity(person: Person): CachedProfileIdentity | null {
	const initials = getInitials(person);
	if(!initials) return null;
	return {
		initials,
		firstName: getFirstName(person),
		version: PROFILE_IDENTITY_CACHE_VERSION,
	};
}

function getCachedProfileIdentity(): CachedProfileIdentity | null {
	if(typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(PROFILE_IDENTITY_STORAGE_KEY);
		if(!raw) return null;
		const parsed = JSON.parse(raw) as Partial<CachedProfileIdentity>;
		if(typeof parsed.initials !== "string" || parsed.initials.trim().length === 0) return null;
		const initials = parsed.initials.trim().toUpperCase();
		if(initials === "ME" && parsed.version !== PROFILE_IDENTITY_CACHE_VERSION) {
			window.localStorage.removeItem(PROFILE_IDENTITY_STORAGE_KEY);
			return null;
		}
		return {
			initials,
			firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
			version: typeof parsed.version === "number" ? parsed.version : 1,
		};
	} catch {
		return null;
	}
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
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [closing, setClosing] = useState(false);
	const [person, setPerson] = useState<Person | null>(null);
	const [avatar, setAvatar] = useState<YaleMojiAvatar | null>(null);
	const [cachedIdentity, setCachedIdentity] = useState<CachedProfileIdentity | null>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if(closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
		setOpen(false);
		setClosing(false);
	}, [pathname]);

	const openDropdown = useCallback(() => {
		if(closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
		setClosing(false);
		setOpen(true);
	}, []);

	const closeDropdown = useCallback(() => {
		if(!open || closing) return;
		setClosing(true);
		closeTimeoutRef.current = setTimeout(() => {
			setOpen(false);
			setClosing(false);
		}, DROPDOWN_ANIMATION_MS);
	}, [closing, open]);

	const toggleDropdown = useCallback(() => {
		if(open && !closing) {
			closeDropdown();
			return;
		}
		openDropdown();
	}, [closing, closeDropdown, open, openDropdown]);

	useEffect(() => {
		setCachedIdentity(getCachedProfileIdentity());
	}, []);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if(wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) closeDropdown();
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [closeDropdown]);

	useEffect(() => {
		return () => {
			if(closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
		};
	}, []);

	useEffect(() => {
		if(!isAuthenticated) {
			setAvatar(null);
			setPerson(null);
			invalidateProfileCache();
			return;
		}
		let active = true;
		let unsubscribeAvatar: (() => void) | undefined;
		const load = async () => {
			const result = await getProfile();
			if(!active || !result) return;
			unsubscribeAvatar = subscribeYaleMoji(result.profile.netid, setAvatar);
			setPerson(result.person);
			if(result.person) {
				const identity = getProfileIdentity(result.person);
				if(identity) {
					setCachedIdentity(identity);
					window.localStorage.setItem(PROFILE_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
				}
			}
		};
		void load();
		return () => {
			active = false;
			unsubscribeAvatar?.();
		};
	}, [isAuthenticated]);

	const initials = useMemo(() => {
		const personInitials = getInitials(person);
		if(personInitials) return personInitials;
		const cachedInitials = cachedIdentity?.initials.trim().toUpperCase();
		if(cachedInitials && (cachedInitials !== "ME" || cachedIdentity?.version === PROFILE_IDENTITY_CACHE_VERSION)) return cachedInitials;
		return "";
	}, [cachedIdentity, person]);

	const avatarStyle = avatar ? { backgroundImage: `url("${avatar.background_url}")` } : undefined;

	if (isAuthenticated) {
		return (
			<div className={styles.profile_wrapper} ref={wrapperRef}>
				<button
					type="button"
					className={styles.profile_button}
					style={avatarStyle}
					onMouseEnter={() => prefetchProfile()}
					onClick={toggleDropdown}
					aria-label="Profile menu"
					aria-expanded={open && !closing}
				>
					{avatar ? (
						<img src={avatar.png_url} alt="" className={styles.button_avatar} onError={() => setAvatar(null)} />
					) : initials ? (
						<span suppressHydrationWarning>{initials}</span>
					) : (
						<FontAwesomeIcon icon={faUser} className={styles.profile_fallback_icon} />
					)}
				</button>
				{open && (
					<div className={`${styles.dropdown} ${closing ? styles.closing : ""}`}>
						<div className={styles.identity_header} style={avatarStyle}>
							{avatar && <YaleMojiLink
								className={styles.header_edit}
								href="https://yalemoji.com/editor?ref=yalies"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Edit your Yalemoji"
								title="Edit your Yalemoji"
							>
								<img src="/icons/yalemoji.svg" alt="" className={styles.header_edit_icon} width={20} height={16} />
							</YaleMojiLink>}
							{avatar ? (
								<img src={avatar.png_url} alt="Your Yalemoji" className={styles.header_avatar} onError={() => setAvatar(null)} />
							) : (
								<div className={styles.header_initials} suppressHydrationWarning>
									{initials || <FontAwesomeIcon icon={faUser} className={styles.header_fallback_icon} />}
								</div>
							)}
							{!avatar && (
								<YaleMojiLink
									className={styles.create_yalemoji}
									href="https://yalemoji.com/create?ref=yalies"
									target="_blank"
									rel="noopener noreferrer"
								>
									Make your Yalemoji
								</YaleMojiLink>
							)}
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
									clearYaleMojiCache();
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
