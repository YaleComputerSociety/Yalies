"use client";
import { API_URL, COLLEGE_SHIELDS } from "@/consts";

import { useEffect, useState, useRef } from "react";
import { Person, UserProfile, API } from "yalies-shared";
import styles from "./personmodal.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
	faBook,
	faCake,
	faGraduationCap,
	faHouse,
	faBuilding,
	faUser,
	faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import FriendButton from "./FriendButton";
import EmailCopyButton from "./EmailCopyButton";

export default function PersonModal({
	person,
	onClose,
}: {
	person: Person;
	onClose: () => void;
}) {
	const [userProfile, setUserProfile] = useState<UserProfile | null>(person.user_profile ?? null);
	const [isVisible, setIsVisible] = useState(false);
	const backdropRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		requestAnimationFrame(() => setIsVisible(true));

		const handleEscape = (e: KeyboardEvent) => {
			if(e.key === "Escape") handleClose();
		};
		document.addEventListener("keydown", handleEscape);
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", handleEscape);
			document.body.style.overflow = "";
		};
	}, []);

	useEffect(() => {

		if(userProfile) return;
		if(!person.netid) return;
		const fetchProfile = async () => {
			try {
				const response = await fetch(`${API_URL}${API.profile(person.netid!)}`, {
					method: "GET",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
				});
				if(response.ok) {
					setUserProfile(await response.json());
				}
			} catch(e) {
				console.error(e);
			}
		};
		fetchProfile();
	}, [person.netid]);

	const handleClose = () => {
		setIsVisible(false);
		setTimeout(onClose, 200);
	};

	const onBackdropClick = (e: React.MouseEvent) => {
		if(e.target === backdropRef.current) handleClose();
	};

	const displayName = `${person.preferred_name || person.first_name} ${person.last_name}`;

	const birthdayDate = new Date();
	let birthdayString = "";
	if(person.birth_month && person.birth_day) {
		birthdayDate.setMonth(person.birth_month - 1);
		birthdayDate.setDate(person.birth_day);
		birthdayString = birthdayDate.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	}
	const todayIsBirthday = person.birth_month === new Date().getMonth() + 1 && person.birth_day === new Date().getDate();
	const hasContactRow = person.email || userProfile?.linkedin_url || userProfile?.instagram_url;

	return (
		<div
			ref={backdropRef}
			className={`${styles.backdrop} ${isVisible ? styles.visible : ""}`}
			onClick={onBackdropClick}
		>
			<div className={`${styles.modal} ${isVisible ? styles.visible : ""}`}>
				<button className={styles.close_button} onClick={handleClose}>
					<FontAwesomeIcon icon={faXmark} />
				</button>

				<div className={styles.header}>
					<div className={styles.photo_section}>
						{person.image ? (
							<img
								className={styles.profile_image}
								src={person.image}
								alt={displayName}
								decoding="async"
								onError={(e) => {

									const img = e.target as HTMLImageElement;
									const placeholder = img.nextElementSibling as HTMLElement;
									img.style.display = "none";
									if (placeholder) placeholder.style.display = "";
								}}
							/>
						) : null}
						<div
							className={styles.photo_placeholder}
							style={person.image ? { display: "none" } : {}}
						>
							<FontAwesomeIcon icon={faUser} />
						</div>
					</div>
					<div className={styles.header_info}>
						<div className={styles.name_row}>
							<h2 className={styles.name}>{displayName}</h2>
							{person.netid && (
								<FriendButton
									netid={person.netid}
									initialStatus={person.friend_data?.status}
									initialCount={person.friend_data?.count}
								/>
							)}
						</div>
						{person.pronouns && (
							<span className={styles.pronouns}>{person.pronouns}</span>
						)}
						<div className={styles.info_rows}>
							{person.college && (
								<div className={styles.info_row}>
									{person.college_code && COLLEGE_SHIELDS[person.college_code] ? (
										<img
											src={COLLEGE_SHIELDS[person.college_code]}
											alt={person.college_code}
											className={styles.college_shield}
										/>
									) : (
										<FontAwesomeIcon icon={faBuilding} />
									)}
									<span>{person.college}</span>
								</div>
							)}
							{person.year && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faGraduationCap} />
									<span>Class of {person.year}</span>
								</div>
							)}
							{person.school && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faBuilding} />
									<span>{person.school}</span>
								</div>
							)}
							{person.major && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faBook} />
									<span>{person.major}</span>
								</div>
							)}
							{person.address && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faHouse} />
									<span>{person.address}</span>
								</div>
							)}
							{birthdayString && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faCake} />
									<span>{birthdayString}{todayIsBirthday ? " \u2014 Happy Birthday!" : ""}</span>
								</div>
							)}
						</div>
					</div>
				</div>

				{hasContactRow && (
					<div className={styles.contact_section}>
						{person.email && (
							<EmailCopyButton className={styles.contact_email} email={person.email} />
						)}
						<div className={styles.contact_socials}>
							{userProfile?.linkedin_url && (
								<a
									href={userProfile.linkedin_url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="LinkedIn"
								>
									<FontAwesomeIcon icon={faLinkedin as IconProp} />
								</a>
							)}
							{userProfile?.instagram_url && (
								<a
									href={userProfile.instagram_url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Instagram"
								>
									<FontAwesomeIcon icon={faInstagram as IconProp} />
								</a>
							)}
						</div>
					</div>
				)}

			</div>
		</div>
	);
}
