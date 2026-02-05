"use client";
import { useMemo } from "react";
import { Person } from "../../../yalies-shared/datatypes";
import styles from "./peoplegrid.module.scss";
import Chip, { ClickableChip } from "./Chip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faCake, faEnvelope, faGraduationCap, faHouse } from "@fortawesome/free-solid-svg-icons";
import InfiniteScroll from "react-infinite-scroll-component";

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
}: {
	people: Person[];
	loadMoreFunction: () => void;
	hasReachedEnd: boolean;
}) {
	const peopleElems = useMemo(() => {
		return people.map(person => {
			const longValues = [
				person.email && (
					<div key="email" title="Email" className={styles.row}>
						<FontAwesomeIcon icon={faEnvelope} />
						<span><a href={`mailto:${person.email}`}>{person.email}</a></span>
					</div>
				),
				person.college_code && person.college_code in COLLEGE_SHIELDS && (
					<div key="college_code" title="Residential College" className={styles.row}>
						<CollegeIcon collegeCode={person.college_code as keyof typeof COLLEGE_SHIELDS} />
						<span>{person.college}</span>
					</div>
				),
				person.year && (
					<div key="year" title="Graduation Year" className={styles.row}>
						<FontAwesomeIcon icon={faGraduationCap} />
						<span>{person.year}</span>
					</div>
				),
			];

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
			const chips = [
				person.netid && (
					<ClickableChip
						key="netid"
						defaultText={`NetID ${person.netid}`}
						clickedText="Copied!"
						onClick={() => copyText(person.netid)}
					/>
				),
				person.upi && (
					<ClickableChip
						key="upi"
						defaultText={`UPI ${person.upi}`}
						clickedText="Copied!"
						onClick={() => copyText(person.upi?.toString())}
					/>
				),
				person.major && (
					<Chip key="major" icon={faBook}>{person.major}</Chip>
				),
				person.birth_month && person.birth_day && (
					<Chip key="birthday" icon={faCake} birthday={todayIsBirthday}>{birthdayString}</Chip>
				),
				person.address && (
					<Chip key="address" icon={faHouse}>{person.address}</Chip>
				),
			];

			return (
				<div key={person.netid} className={styles.person}>
					<div className={styles.info_box}>
						<img
							className={styles.profile_image}
							src={person.image || "/no_image.png"}
							alt={`${person.first_name} ${person.last_name}`}
						/>
						<div className={styles.details}>
							<h3 className={styles.name}>{person.last_name}, {person.first_name}</h3>
							{longValues}
						</div>
					</div>
					<div className={styles.chip_container}>{chips}</div>
				</div>
			);
		});
	}, [people]);

	return (
		<InfiniteScroll
			className={styles.people_grid}
			dataLength={people.length}
			next={loadMoreFunction}
			hasMore={!hasReachedEnd}
			loader={<LoadingIcon />}
		>
			{peopleElems}
		</InfiniteScroll>
	);
};
