"use client";

import { useMemo, useState } from "react";
import { Person } from "yalies-shared";
import styles from "./birthdaysection.module.scss";
import gridStyles from "./peoplegrid.module.scss";
import PersonModal from "./PersonModal";
import CardContactActions from "./CardContactActions";
import PersonCardShell from "./PersonCardShell";
import SaveToListButton from "./SaveToListButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCake, faGraduationCap, faHouse } from "@fortawesome/free-solid-svg-icons";
import { COLLEGE_SHIELDS } from "@/consts";
import { prioritizeYaleMojis } from "@/helpers/yalemojiOrdering";
import { formatCardCollegeYear, formatCardMajor } from "@/helpers/cardLabels";
import MajorIcon from "./MajorIcon";
import { getMajorIconKind } from "@/helpers/majorIconKind";

function CollegeIcon({ collegeCode }: { collegeCode: string }) {
	const shield = COLLEGE_SHIELDS[collegeCode];
	if (!shield) return null;
	return <img src={shield} alt={collegeCode} className={gridStyles.college_shield} />;
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
	const orderedPeople = useMemo(() => prioritizeYaleMojis(people), [people]);

	if (people.length === 0) return null;

	return (
		<>
			<div className={gridStyles.people_grid}>
				<div className={styles.header}>
					<FontAwesomeIcon icon={faCake} />
					<span>Birthdays Today</span>
				</div>
				{orderedPeople.map(person => {
					const hasCollegeShield = person.college_code && person.college_code in COLLEGE_SHIELDS;
					const collegeYearText = formatCardCollegeYear(person);
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
								<span title={person.college}>{collegeYearText}</span>
							</div>
						),
						person.major && person.major.trim().toLowerCase() !== "undeclared" && (
							<div key="major" className={`${gridStyles.row} ${gridStyles.major_row}`} data-major-icon={getMajorIconKind(person.major)}>
								<MajorIcon major={person.major} />
								<span title={person.major}>{formatCardMajor(person.major)}</span>
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


					return (
						<PersonCardShell
							key={person.netid}
							person={person}
							onOpen={() => setSelectedPerson(person)}
						>
							<div className={gridStyles.info_box}>
								<div className={gridStyles.photo_column}>
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
									<CardContactActions person={person} />
								</div>
								<div className={gridStyles.details}>
									{person.netid && <SaveToListButton person={person} className={gridStyles.save_to_list} />}
									<div className={gridStyles.name_row}>
										<h3 className={gridStyles.name}>{person.first_name} {person.last_name}</h3>
									</div>
									{detailRows}
								</div>
							</div>
						</PersonCardShell>
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
