"use client";

import { useState } from "react";
import { Person } from "yalies-shared";
import styles from "./birthdaysection.module.scss";
import gridStyles from "./peoplegrid.module.scss";
import PersonModal from "./PersonModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faCake, faBook, faGraduationCap, faHouse } from "@fortawesome/free-solid-svg-icons";
import { faInstagram, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { COLLEGE_SHIELDS } from "@/consts";
import EmailCopyButton from "./EmailCopyButton";
import { normalizeExternalUrl } from "@/utils/externalUrl";

function CollegeIcon({ collegeCode }: { collegeCode: string }) {
	const shield = COLLEGE_SHIELDS[collegeCode];
	if (!shield) return null;
	return <img src={shield} alt={collegeCode} className={gridStyles.college_shield} />;
}

function formatCollegeYear(person: Person) {
	const college = person.college?.replace(/\s+College$/i, "");
	return [college, person.year && `'${String(person.year).slice(-2)}`].filter(Boolean).join(" ");
}

function formatBirthday(person: Person) {
	if (!person.birth_month || !person.birth_day) return "";
	return new Date(2000, person.birth_month - 1, person.birth_day).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function formatHometown(person: Person) {
	if (!person.address) return "";
	return person.address
		.replace(/\s+\d{5}(?:-\d{4})?\b/g, "")
		.replace(/[,\s]+$/, "")
		.trim();
}

function isBirthdayToday(person: Person) {
	const today = new Date();
	return person.birth_month === today.getMonth() + 1 && person.birth_day === today.getDate();
}

export default function BirthdaySection({ people }: { people: Person[] }) {
	const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

	if (people.length === 0) return null;

	return (
		<>
			<div className={gridStyles.people_grid}>
				<div className={styles.header}>
					<FontAwesomeIcon icon={faCake} />
					<span>Birthdays Today</span>
				</div>
				{people.map(person => {
					const hasCollegeShield = person.college_code && person.college_code in COLLEGE_SHIELDS;
					const collegeYearText = formatCollegeYear(person);
					const hometownText = formatHometown(person);
					const birthdayText = formatBirthday(person);
					const birthdayToday = isBirthdayToday(person);

					const detailRows = [
						collegeYearText && (
							<div key="college_year" className={gridStyles.row}>
								{hasCollegeShield ? (
									<CollegeIcon collegeCode={person.college_code!} />
								) : person.year ? (
									<FontAwesomeIcon icon={faGraduationCap} />
								) : null}
								<span>{collegeYearText}</span>
							</div>
						),
						person.major && (
							<div key="major" className={gridStyles.row}>
								<FontAwesomeIcon icon={faBook} />
								<span>{person.major}</span>
							</div>
						),
						hometownText && (
							<div key="hometown" className={gridStyles.row}>
								<FontAwesomeIcon icon={faHouse} />
								<span>{hometownText}</span>
							</div>
						),
						birthdayText && (
							<div key="birthday" className={`${gridStyles.row} ${birthdayToday ? gridStyles.birthday_today : ""}`}>
								<FontAwesomeIcon icon={faCake} />
								<span>{birthdayText}</span>
							</div>
						),
					];

					const linkedinUrl = normalizeExternalUrl(person.user_profile?.linkedin_url);
					const instagramUrl = normalizeExternalUrl(person.user_profile?.instagram_url);
					const hasFooter = person.email || linkedinUrl || instagramUrl;

					return (
						<div
							key={person.netid}
							className={gridStyles.person}
							onClick={() => setSelectedPerson(person)}
						>
							<div className={gridStyles.info_box}>
								<div className={gridStyles.profile_image_frame}>
									<img
										className={gridStyles.profile_image}
										src={person.image || "/no_image.png"}
										alt={`${person.first_name} ${person.last_name}`}
										loading="lazy"
										decoding="async"
										onError={(e) => { (e.target as HTMLImageElement).src = "/no_image.png"; }}
									/>
								</div>
								<div className={gridStyles.details}>
									<div className={gridStyles.name_row}>
										<h3 className={gridStyles.name}>{person.first_name} {person.last_name}</h3>
									</div>
									{detailRows}
								</div>
							</div>
							{hasFooter && (
								<div className={gridStyles.card_footer}>
									{person.email && (
										<EmailCopyButton
											className={gridStyles.email_link}
											email={person.email}
											stopPropagation
										/>
									)}
									<div className={gridStyles.card_socials}>
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
						</div>
					);
				})}
			</div>
			{selectedPerson && (
				<PersonModal
					person={selectedPerson}
					onClose={() => setSelectedPerson(null)}
				/>
			)}
		</>
	);
}
