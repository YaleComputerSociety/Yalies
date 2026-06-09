"use client";

import { useState, Fragment } from "react";
import { Person } from "yalies-shared";
import styles from "./birthdaysection.module.scss";
import gridStyles from "./peoplegrid.module.scss";
import PersonModal from "./PersonModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCake, faBook, faEnvelope, faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import { COLLEGE_SHIELDS } from "@/consts";

function CollegeIcon({ collegeCode }: { collegeCode: string }) {
	const shield = COLLEGE_SHIELDS[collegeCode];
	if (!shield) return null;
	return <img src={shield} alt={collegeCode} className={gridStyles.college_shield} />;
}

function CopyableText({ text, label }: { text: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};
	return (
		<span className={gridStyles.meta_item} onClick={handleClick} title="Click to copy">
			{copied ? "Copied!" : (label || text)}
		</span>
	);
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
					const collegeYearParts: string[] = [];
					if (person.college) collegeYearParts.push(person.college);
					if (person.year) collegeYearParts.push(`'${String(person.year).slice(-2)}`);
					const collegeYearText = collegeYearParts.join(" \u00B7 ");

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
						person.email && (
							<div key="email" className={gridStyles.row}>
								<FontAwesomeIcon icon={faEnvelope} />
								<a href={`mailto:${person.email}`} onClick={e => e.stopPropagation()}>{person.email}</a>
							</div>
						),
					];

					const footerItems: React.ReactNode[] = [];
					if (person.netid) footerItems.push(<CopyableText key="netid" text={person.netid} />);
					if (person.upi) footerItems.push(<CopyableText key="upi" text={person.upi.toString()} />);

					return (
						<div
							key={person.netid}
							className={gridStyles.person}
							onClick={() => setSelectedPerson(person)}
						>
							<div className={gridStyles.info_box}>
								<img
									className={gridStyles.profile_image}
									src={person.image || "/no_image.png"}
									alt={`${person.first_name} ${person.last_name}`}
									loading="lazy"
									decoding="async"
									onError={(e) => { (e.target as HTMLImageElement).src = "/no_image.png"; }}
								/>
								<div className={gridStyles.details}>
									<div className={gridStyles.name_row}>
										<h3 className={gridStyles.name}>{person.last_name}, {person.first_name}</h3>
									</div>
									{detailRows}
								</div>
							</div>
							{footerItems.length > 0 && (
								<div className={gridStyles.card_footer}>
									{footerItems.map((item, i) => (
										<Fragment key={i}>
											{i > 0 && <span className={gridStyles.separator}>&middot;</span>}
											{item}
										</Fragment>
									))}
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
