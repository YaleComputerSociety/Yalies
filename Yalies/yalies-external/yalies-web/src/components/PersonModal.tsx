"use client";

import { useEffect, useState, useRef } from "react";
import { Person, UserProfile, API } from "yalies-shared";
import styles from "./personmodal.module.scss";
import ClickableChip from "./ClickableChip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	faBook,
	faCake,
	faEnvelope,
	faGraduationCap,
	faHouse,
	faBuilding,
	faUser,
	faXmark,
	faHeart,
} from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import FriendButton from "./FriendButton";
import Chip from "./Chip";

const COLLEGE_SHIELDS: Record<string, string> = {
	"BF": "/shields/BF.png",
	"BK": "/shields/BK.png",
	"BR": "/shields/BR.png",
	"DC": "/shields/DC.png",
	"ES": "/shields/ES.png",
	"GH": "/shields/GH.png",
	"JE": "/shields/JE.png",
	"MC": "/shields/MC.png",
	"MY": "/shields/MY.png",
	"PC": "/shields/PC.png",
	"SM": "/shields/SM.png",
	"SY": "/shields/SY.png",
	"TC": "/shields/TC.png",
	"TD": "/shields/TD.png",
};

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
				const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.profile(person.netid)}`, {
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
	const copyText = (text: string | undefined) => text && navigator.clipboard.writeText(text);

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
					</div>
					{person.pronouns && (
						<span className={styles.pronouns}>{person.pronouns}</span>
					)}
					{person.netid && (
						<FriendButton
							netid={person.netid}
							initialStatus={person.friend_data?.status}
							initialCount={person.friend_data?.count}
						/>
					)}
						<div className={styles.info_rows}>
							{person.email && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faEnvelope} />
									<a href={`mailto:${person.email}`}>{person.email}</a>
								</div>
							)}
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

				{(person.netid || person.upi) && (
					<div className={styles.ids_section}>
						{person.netid && (
							<ClickableChip
								defaultText={`NetID ${person.netid}`}
								clickedText="Copied!"
								onClick={() => copyText(person.netid)}
							/>
						)}
						{person.upi && (
							<ClickableChip
								defaultText={`UPI ${person.upi}`}
								clickedText="Copied!"
								onClick={() => copyText(person.upi?.toString())}
							/>
						)}
					</div>
				)}

				<div className={styles.extra_info}>
					<div className={styles.description_section}>
						<h3 className={styles.section_label}>About</h3>
						{userProfile?.description ? (
							<p className={styles.description_text}>{userProfile.description}</p>
						) : (
							<span className={styles.empty_text}>No description added</span>
						)}
					</div>

					<div className={styles.interests_section}>
						<h3 className={styles.section_label}>Interests</h3>
						{userProfile?.interests && userProfile.interests.length > 0 ? (
							<div className={styles.interests_list}>
								{userProfile.interests.map(i => (
									<Chip key={i} icon={faHeart} primary>{i}</Chip>
								))}
							</div>
						) : (
							<span className={styles.empty_text}>No interests added</span>
						)}
					</div>

					<h3 className={styles.section_label}>Social</h3>
					<div className={styles.social_links}>
						{userProfile?.linkedin_url ? (
							<a
								href={userProfile.linkedin_url}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.social_link}
							>
								<FontAwesomeIcon icon={faLinkedin} />
								<span>LinkedIn</span>
							</a>
						) : (
							<span className={styles.empty_text}>No LinkedIn added</span>
						)}
						{userProfile?.instagram_url && (
							<a
								href={userProfile.instagram_url}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.social_link}
							>
								<FontAwesomeIcon icon={faInstagram} />
								<span>Instagram</span>
							</a>
						)}
					</div>

					<div className={styles.classes_section}>
						<h3 className={styles.section_label}>Classes</h3>
						{userProfile?.classes && userProfile.classes.length > 0 ? (
							<div className={styles.classes_list}>
								{userProfile.classes.map(c => (
									<Chip key={c} icon={faBook} primary>{c}</Chip>
								))}
							</div>
						) : (
							<span className={styles.empty_text}>No classes added</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
