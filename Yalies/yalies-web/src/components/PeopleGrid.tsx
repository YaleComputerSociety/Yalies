"use client";
import { useState, Fragment } from "react";
import { Person } from "../../../yalies-shared/datatypes";
import styles from "./peoplegrid.module.scss";
import PersonModal from "./PersonModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faCake, faEnvelope, faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import InfiniteScroll from "react-infinite-scroll-component";
import LikeButton from "./LikeButton";

const COLLEGE_SHIELDS = {
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

function CollegeIcon({ collegeCode }: { collegeCode: keyof typeof COLLEGE_SHIELDS }) {
	const shield: string = COLLEGE_SHIELDS[collegeCode];
	if(!shield) return null;
	return <img src={shield} alt={collegeCode} className={styles.college_shield} />;
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
		<span className={styles.meta_item} onClick={handleClick} title="Click to copy">
			{copied ? "Copied!" : (label || text)}
		</span>
	);
}

function LoadingIcon() {
	return (
		<div className={styles.loading_icon_container}>
			<img src="/logo.png" alt="Loading" className={styles.loading_icon} />
		</div>
	);
}

export default function PeopleGrid({
	people,
	loadMoreFunction,
	hasReachedEnd,
	isSearching,
}: {
	people: Person[];
	loadMoreFunction: () => void;
	hasReachedEnd: boolean;
	isSearching?: boolean;
}) {
	const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

	const peopleElems = people.map(person => {
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

			const hasCollegeShield = person.college_code && person.college_code in COLLEGE_SHIELDS;

			// College + Year combined into one concise line
			const collegeYearParts: string[] = [];
			if(person.college) collegeYearParts.push(person.college);
			if(person.year) collegeYearParts.push(`'${String(person.year).slice(-2)}`);
			const collegeYearText = collegeYearParts.join(" \u00B7 ");

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
				person.email && (
					<div key="email" className={styles.row}>
						<FontAwesomeIcon icon={faEnvelope} />
						<a href={`mailto:${person.email}`} onClick={e => e.stopPropagation()}>{person.email}</a>
					</div>
				),
			];

			// Footer: small copy-able IDs + birthday if today
			const footerItems: React.ReactNode[] = [];
			if(person.netid) footerItems.push(<CopyableText key="netid" text={person.netid} />);
			if(person.upi) footerItems.push(<CopyableText key="upi" text={person.upi.toString()} />);
			if(todayIsBirthday && birthdayString) {
				footerItems.push(
					<span key="birthday" className={styles.meta_birthday}>
						<FontAwesomeIcon icon={faCake} /> {birthdayString}
					</span>
				);
			}

			const cardContent = (
				<>
					<div className={styles.info_box}>
						<img
							className={styles.profile_image}
							src={person.image || "/no_image.png"}
							alt={`${person.first_name} ${person.last_name}`}
							onError={(e) => { (e.target as HTMLImageElement).src = "/no_image.png"; }}
						/>
						<div className={styles.details}>
							<div className={styles.name_row}>
								<h3 className={styles.name}>{person.last_name}, {person.first_name}</h3>
								{person.netid && (
									<div onClick={(e) => e.stopPropagation()}>
										<LikeButton netid={person.netid} />
									</div>
								)}
							</div>
							{detailRows}
						</div>
					</div>
					{footerItems.length > 0 && (
						<div className={styles.card_footer}>
							{footerItems.map((item, i) => (
								<Fragment key={i}>
									{i > 0 && <span className={styles.separator}>&middot;</span>}
									{item}
								</Fragment>
							))}
						</div>
					)}
				</>
			);

			return (
				<div key={person.netid} className={`${styles.person} ${todayIsBirthday ? styles.birthday : ""}`} onClick={() => setSelectedPerson(person)}>
					{todayIsBirthday ? (
						<div className={styles.birthday_inner}>{cardContent}</div>
					) : cardContent}
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
