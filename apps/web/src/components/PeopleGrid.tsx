"use client";
import { useEffect, useRef, useState } from "react";
import { Person } from "yalies-shared";
import styles from "./peoplegrid.module.scss";
import PersonModal from "./PersonModal";
import CardContactActions from "./CardContactActions";
import PersonCardShell from "./PersonCardShell";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCake, faGraduationCap, faHouse, faUsers } from "@fortawesome/free-solid-svg-icons";
import InfiniteScroll from "react-infinite-scroll-component";
import { COLLEGE_SHIELDS } from "@/consts";
import SaveToListButton from "./SaveToListButton";
import { getSavedEntry, useSavedLists } from "@/hooks/useSavedLists";
import { formatCardCollegeYear, formatCardMajor } from "@/helpers/cardLabels";
import MajorIcon from "./MajorIcon";
import { getMajorIconKind } from "@/helpers/majorIconKind";

function CollegeIcon({ collegeCode }: { collegeCode: string }) {
	const shield = COLLEGE_SHIELDS[collegeCode];
	if(!shield) return null;
	return <img src={shield} alt={collegeCode} className={styles.college_shield} />;
}

function LoadingIcon() {
	return (
		<div className={styles.loading_icon_container}>
			<img src="/logo.svg" alt="Loading" className={styles.loading_icon} />
		</div>
	);
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
	showSavedNotes = false,
	currentListId,
	paginationLength,
	emptyMessage = "No results found. Try a different search or adjust your filters.",
}: {
	people: Person[];
	loadMoreFunction: () => void;
	hasReachedEnd: boolean;
	isSearching?: boolean;
	sectionTitle?: string;
	showSavedNotes?: boolean;
	currentListId?: number;
	paginationLength?: number;
	emptyMessage?: string;
}) {
	const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
	const savedLists = useSavedLists();
	const loadMoreTarget = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if(paginationLength === undefined || hasReachedEnd || isSearching || !loadMoreTarget.current) return;
		const observer = new IntersectionObserver(entries => {
			if(entries.some(entry => entry.isIntersecting)) loadMoreFunction();
		}, { rootMargin: "400px" });
		observer.observe(loadMoreTarget.current);
		return () => observer.disconnect();
	}, [hasReachedEnd, isSearching, loadMoreFunction, paginationLength]);

	const peopleElems = people.map(person => {
		const hasCollegeShield = person.college_code && person.college_code in COLLEGE_SHIELDS;

		const collegeYearText = formatCardCollegeYear(person);
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
					<span title={person.college}>{collegeYearText}</span>
				</div>
			),
			person.major && person.major.trim().toLowerCase() !== "undeclared" && (
				<div key="major" className={`${styles.row} ${styles.major_row}`} data-major-icon={getMajorIconKind(person.major)}>
					<MajorIcon major={person.major} />
					<span title={person.major}>{formatCardMajor(person.major)}</span>
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


		const cardContent = (
			<>
				<div className={styles.info_box}>
					<div className={styles.photo_column}>
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
						<CardContactActions person={person} />
					</div>
					<div className={styles.details}>
						{person.netid && <SaveToListButton person={person} currentListId={currentListId} className={styles.save_to_list} />}
						<div className={styles.name_row}>
							<h3 className={styles.name}>{person.first_name} {person.last_name}</h3>
						</div>
						{detailRows}
					</div>
				</div>
			</>
		);

		return (
			<PersonCardShell key={person.netid} person={person} onOpen={() => setSelectedPerson(person)}
				notePreview={showSavedNotes ? getSavedEntry(savedLists, person)?.note : undefined}>
				{cardContent}
			</PersonCardShell>
		);
	});

	const showEmpty = !isSearching && hasReachedEnd && people.length === 0;

	return (
		<>
			{isSearching && people.length === 0 && <LoadingIcon />}
			{showEmpty && (
				<div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
					{emptyMessage}
				</div>
			)}
			<InfiniteScroll
				style={{ overflow: "visible" }}
				className={`${styles.people_grid} ${showSavedNotes ? styles.saved_grid : ""}`}
				dataLength={paginationLength ?? people.length}
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
			{paginationLength !== undefined && <div ref={loadMoreTarget} aria-hidden="true" />}
			{selectedPerson && (
				<PersonModal
					person={selectedPerson}
					currentListId={currentListId}
					onClose={() => setSelectedPerson(null)}
				/>
			)}
		</>
	);
};
