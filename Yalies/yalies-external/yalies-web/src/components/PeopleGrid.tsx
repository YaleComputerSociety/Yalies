"use client";
import { useState } from "react";
import { Person } from "yalies-shared";
import styles from "./peoplegrid.module.scss";
import PersonModal from "./PersonModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faBook, faCake, faGraduationCap, faHouse, faUsers } from "@fortawesome/free-solid-svg-icons";
import { faInstagram, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import InfiniteScroll from "react-infinite-scroll-component";
import { COLLEGE_SHIELDS } from "@/consts";
import EmailCopyButton from "./EmailCopyButton";
import { normalizeExternalUrl } from "@/utils/externalUrl";

function CollegeIcon({ collegeCode }: { collegeCode: string }) {
	const shield = COLLEGE_SHIELDS[collegeCode];
	if(!shield) return null;
	return <img src={shield} alt={collegeCode} className={styles.college_shield} />;
}

function LoadingIcon() {
	return (
		<div className={styles.loading_icon_container}>
			<img src="/logo.png" alt="Loading" className={styles.loading_icon} />
		</div>
	);
}

function formatCollegeYear(person: Person) {
	const college = person.college?.replace(/\s+College$/i, "");
	return [college, person.year && `'${String(person.year).slice(-2)}`].filter(Boolean).join(" ");
}

function formatBirthday(person: Person) {
	if(!person.birth_month || !person.birth_day) return "";
	return new Date(2000, person.birth_month - 1, person.birth_day).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function formatHometown(person: Person) {
	if(!person.address) return "";
	return person.address
		.replace(/\s+\d{5}(?:-\d{4})?\b/g, "")
		.replace(/[,\s]+$/, "")
		.trim();
}

function isBirthdayToday(person: Person) {
	const today = new Date();
	return person.birth_month === today.getMonth() + 1 && person.birth_day === today.getDate();
}

export default function PeopleGrid({
	people,
	loadMoreFunction,
	hasReachedEnd,
	isSearching,
	sectionTitle,
}: {
	people: Person[];
	loadMoreFunction: () => void;
	hasReachedEnd: boolean;
	isSearching?: boolean;
	sectionTitle?: string;
}) {
	const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

	const peopleElems = people.map(person => {
		const hasCollegeShield = person.college_code && person.college_code in COLLEGE_SHIELDS;

		const collegeYearText = formatCollegeYear(person);
		const hometownText = formatHometown(person);
		const birthdayText = formatBirthday(person);
		const birthdayToday = isBirthdayToday(person);

		const detailRows = [
			collegeYearText && (
				<div key="college_year" className={styles.row}>
					{hasCollegeShield ? (
						<CollegeIcon collegeCode={person.college_code as keyof typeof COLLEGE_SHIELDS} />
					) : person.year ? (
						<FontAwesomeIcon icon={faGraduationCap} />
					) : null}
					<span>{collegeYearText}</span>
				</div>
			),
			person.major && (
				<div key="major" className={styles.row}>
					<FontAwesomeIcon icon={faBook} />
					<span>{person.major}</span>
				</div>
			),
			hometownText && (
				<div key="hometown" className={styles.row}>
					<FontAwesomeIcon icon={faHouse} />
					<span>{hometownText}</span>
				</div>
			),
			birthdayText && (
				<div key="birthday" className={`${styles.row} ${birthdayToday ? styles.birthday_today : ""}`}>
					<FontAwesomeIcon icon={faCake} />
					<span>{birthdayText}</span>
				</div>
			),
		];

		const linkedinUrl = normalizeExternalUrl(person.user_profile?.linkedin_url);
		const instagramUrl = normalizeExternalUrl(person.user_profile?.instagram_url);
		const hasFooter = person.email || linkedinUrl || instagramUrl;

		const cardContent = (
			<>
				<div className={styles.info_box}>
					<div className={styles.profile_image_frame}>
						<img
							className={styles.profile_image}
							src={person.image || "/no_image.png"}
							alt={`${person.first_name} ${person.last_name}`}
							loading="lazy"
							decoding="async"
							onError={(e) => { (e.target as HTMLImageElement).src = "/no_image.png"; }}
						/>
					</div>
					<div className={styles.details}>
						<div className={styles.name_row}>
							<h3 className={styles.name}>{person.first_name} {person.last_name}</h3>
						</div>
						{detailRows}
					</div>
				</div>
				{hasFooter && (
					<div className={styles.card_footer}>
						{person.email && (
							<EmailCopyButton
								className={styles.email_link}
								email={person.email}
								stopPropagation
							/>
						)}
						<div className={styles.card_socials}>
							{linkedinUrl && (
								<a
									href={linkedinUrl}
									target="_blank"
									rel="noopener noreferrer"
									onClick={e => e.stopPropagation()}
									aria-label="LinkedIn"
								>
									<FontAwesomeIcon icon={faLinkedin as IconProp} />
								</a>
							)}
							{instagramUrl && (
								<a
									href={instagramUrl}
									target="_blank"
									rel="noopener noreferrer"
									onClick={e => e.stopPropagation()}
									aria-label="Instagram"
								>
									<FontAwesomeIcon icon={faInstagram as IconProp} />
								</a>
							)}
						</div>
					</div>
				)}
			</>
		);

		return (
			<div key={person.netid} className={styles.person} onClick={() => setSelectedPerson(person)}>
				{cardContent}
			</div>
		);
	});

	const showEmpty = !isSearching && hasReachedEnd && people.length === 0;

	return (
		<>
			{isSearching && people.length === 0 && <LoadingIcon />}
			{showEmpty && (
				<div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
					No results found. Try a different search or adjust your filters.
				</div>
			)}
			<InfiniteScroll
				className={styles.people_grid}
				dataLength={people.length}
				next={loadMoreFunction}
				hasMore={!hasReachedEnd}
				loader={<LoadingIcon />}
			>
				{sectionTitle && (
					<div className={styles.section_header}>
						<FontAwesomeIcon icon={faUsers} />
						{sectionTitle}
					</div>
				)}
				{peopleElems}
			</InfiniteScroll>
			{selectedPerson && (
				<PersonModal
					person={selectedPerson}
					onClose={() => setSelectedPerson(null)}
				/>
			)}
		</>
	);
};
