"use client";
import { API_URL } from "@/consts";
import PeopleGrid from "@/components/PeopleGrid";
import { useEffect, useState, useCallback, useRef } from "react";
import { Person, API, YALE_COLLEGE } from "yalies-shared";
import Navbar from "@/components/Navbar";
import Filters from "@/components/Filters";
import Topbar from "@/components/Topbar";
import Splash from "@/components/Splash";
import Searchbar from "@/components/Searchbar";
import BirthdaySection from "@/components/BirthdaySection";
import PersonModal from "@/components/PersonModal";
import styles from "./home.module.scss";
import { sendGAEvent } from "@next/third-parties/google";
import { getHomeCache, setHomeCache } from "@/hooks/useHomeCache";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretUp } from "@fortawesome/free-solid-svg-icons";

const RESULT_LABEL_WORDS = ["students", "people", "Yalies", "bulldogs"];
const SEARCH_MODE = "full_name";
const PAGE_SIZE = 20;
const BROWSE_RANDOM_SEED_MAX = 2_147_483_646;
const DEFAULT_FILTERS: Record<string, string[]> = {
	school: [YALE_COLLEGE],
	year: [],
	college: [],
	major: [],
};

function getRandomBrowseSeed() {
	return Math.floor(Math.random() * BROWSE_RANDOM_SEED_MAX) + 1;
}

function getResultsLabel(count: number, label = "Yalies") {
	if (count === 1) return "Showing 1 Yalie";
	return `Showing ${count} ${label}`;
}

function filtersAreDefaultBrowse(filters: Record<string, string[]> | null) {
	return (
		filters !== null &&
		filters.school && filters.school.length === 1 &&
		filters.school[0] === YALE_COLLEGE &&
		filters.year && filters.year.length === 0 &&
		filters.college && filters.college.length === 0 &&
		filters.major && filters.major.length === 0
	);
}

export default function HomePage() {
	const homeCache = getHomeCache();

	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [people, setPeople] = useState<Person[]>(homeCache?.people ?? []);
	const [birthdayPeople, setBirthdayPeople] = useState<Person[]>(homeCache?.birthdayPeople ?? []);
	const [hasReachedEnd, setHasReachedEnd] = useState(homeCache?.hasReachedEnd ?? false);
	const [currentPage, setCurrentPage] = useState(homeCache?.currentPage ?? 0);
	const [filters, setFilters] = useState<Record<string, string[]> | null>(homeCache?.filters ?? DEFAULT_FILTERS);
	const [browseSeed, setBrowseSeed] = useState(homeCache?.browseSeed ?? getRandomBrowseSeed());

	const [searchboxText, setSearchboxText] = useState(homeCache?.query ?? "");
	const [query, setQuery] = useState(homeCache?.query ?? "");
	const [isClient, setIsClient] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [luckyPerson, setLuckyPerson] = useState<Person | null>(null);
	const [resultsLabel, setResultsLabel] = useState(getResultsLabel(homeCache?.people.length ?? 0));
	const [isCompact, setIsCompact] = useState(false);
	const [compactFiltersOpen, setCompactFiltersOpen] = useState(false);
	const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const restoredFromCache = useRef(!!homeCache);

	useEffect(() => {
		const label = RESULT_LABEL_WORDS[Math.floor(Math.random() * RESULT_LABEL_WORDS.length)];
		setResultsLabel(getResultsLabel(people.length, label));
	}, [people.length]);

	useEffect(() => {
		setIsClient(true);
	}, []);

	useEffect(() => {
		const updateCompact = () => setIsCompact(window.innerWidth <= 1024);
		updateCompact();
		window.addEventListener("resize", updateCompact);
		return () => window.removeEventListener("resize", updateCompact);
	}, []);

	const getPeople = useCallback(async () => {
		if(hasReachedEnd) return;
		if(filters === null) return;
		let response;

		let queryActual = query;

		let filterObject: Record<string, string[]> = {};
		if(filters.year && filters.year.length > 0) filterObject.year = filters.year;
		if(filters.school && filters.school.length > 0) filterObject.school = filters.school;
		if(filters.college && filters.college.length > 0) filterObject.college = filters.college;
		if(filters.major && filters.major.length > 0) filterObject.major = filters.major;

		if(queryActual.match(/^[a-z]{2,}\d{1,4}$/i)) {

			queryActual = "";
			filterObject = {
				netid: [query],
				...filterObject,
			};
		} else if(queryActual.match(/^\d{8}$/i)) {

			queryActual = "";
			filterObject = {
				upi: [query],
				...filterObject,
			};
		}

		if (currentPage === 0) {
			setIsSearching(true);
		}
		setSearchError(null);
		const shouldUseRandomBrowseOrder = query.length === 0 && queryActual.length === 0 && filtersAreDefaultBrowse(filters);

		try {
			response = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: queryActual.length > 0 ? queryActual : null,
					searchMode: SEARCH_MODE,
					filters: filterObject,
					page: currentPage,
					page_size: PAGE_SIZE,
					...(shouldUseRandomBrowseOrder && { random_seed: browseSeed }),
				}),
			});
		} catch(e) {
			console.error(e);
			setSearchError("Failed to connect to the server. Please try again.");
			setIsSearching(false);
			return;
		}
		if(!response) {
			console.error("No response from server");
			setSearchError("No response from server. Please try again.");
			setIsSearching(false);
			return;
		}
		if(!response.ok) {
			if(response.status === 401) {
				setUnauthenticated(true);
				setIsSearching(false);
				return;
			}
			if(response.status === 403) {
				window.location.href = "/forbidden";
				return;
			}
			console.error("Error fetching people", response.status, response.statusText, await response.text());
			setSearchError("Something went wrong. Please try again.");
			setIsSearching(false);
			return;
		}
		const newPeople: Person[] = await response?.json();
		if(newPeople.length === 0) {
			setHasReachedEnd(true);
			setIsSearching(false);
			return;
		}
		setPeople((prev) => {
			if(currentPage === 0) return newPeople;
			const seenNetids = new Set(prev.map(person => person.netid).filter(Boolean));
			const uniqueNewPeople = newPeople.filter(person => !person.netid || !seenNetids.has(person.netid));
			return [...prev, ...uniqueNewPeople];
		});
		setCurrentPage((prev) => prev + 1);
		setIsSearching(false);

		if(newPeople.length === PAGE_SIZE) {
			fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: queryActual.length > 0 ? queryActual : null,
					searchMode: SEARCH_MODE,
					filters: filterObject,
					page: currentPage + 1,
					page_size: PAGE_SIZE,
					...(shouldUseRandomBrowseOrder && { random_seed: browseSeed }),
				}),
			}).catch(() => {});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasReachedEnd, filters, query, currentPage, browseSeed]);

	const getTodaysBirthdays = async () => {
		let response;
		try {
			response = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					filters: {
						school: YALE_COLLEGE,
						birth_day: new Date().getDate(),
						birth_month: new Date().getMonth() + 1,
					},
					page_size: 30,
				}),
			});
		} catch(e) {
			console.error(e);
			return;
		}
		if(!response) {
			console.error("No response from server");
			return;
		}
		if(!response.ok) {
			if(response.status === 401) {
				setUnauthenticated(true);
				return;
			}
			if(response.status === 403) {
				window.location.href = "/forbidden";
				return;
			}
			console.error("Error fetching people", response.status, response.statusText, await response.text());
			return;
		}
		const newPeople: Person[] = await response?.json();
		setBirthdayPeople(newPeople);
	};

	useEffect(() => {
		if (restoredFromCache.current && birthdayPeople.length > 0) return;
		getTodaysBirthdays();
	}, []);

	useEffect(() => {

		if (restoredFromCache.current) {
			restoredFromCache.current = false;
			return;
		}
		if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
		filterDebounceRef.current = setTimeout(() => {
			getPeople();
		}, 150);
		return () => {
			if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters, query]);

	useEffect(() => {
		if (people.length > 0 && filters) {
			setHomeCache({
				people,
				birthdayPeople,
				filters,
				query,
				currentPage,
				hasReachedEnd,
				browseSeed,
			});
		}
	}, [people, birthdayPeople, filters, query, currentPage, hasReachedEnd, browseSeed]);

	if(isUnauthenticated) {
		return (
			<>
				<Topbar>
					<Navbar />
				</Topbar>
				<Splash />
			</>
		);
	}

	const filtersAreDefault = filtersAreDefaultBrowse(filters);

	const showBirthdays = filtersAreDefault && query.length === 0 && birthdayPeople.length > 0 && people.length !== 1;

	const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchboxText(e.target.value);
	};

	const onSubmit = () => {
		if(searchboxText === query) return;
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setBrowseSeed(getRandomBrowseSeed());
		setQuery(searchboxText);
		sendGAEvent("event", "search", { query: searchboxText });
	}

	const onFeelingLucky = () => {
		const candidates = people.length > 0 ? people : birthdayPeople;
		if(candidates.length === 0) return;
		const person = candidates[Math.floor(Math.random() * candidates.length)];
		if(person) setLuckyPerson(person);
	};

	const setFilterValue = (key: string, newValue: string[]) => {
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setBrowseSeed(getRandomBrowseSeed());
		setFilters({ ...filters, [key]: newValue });
	};

	const renderSearchbar = (wrapperClassName?: string) => (
		<Searchbar
			value={searchboxText}
			onChange={onQueryChange}
			onClear={() => {
				setSearchboxText("");
				setQuery("");
				setPeople([]);
				setHasReachedEnd(false);
				setCurrentPage(0);
				setBrowseSeed(getRandomBrowseSeed());
			}}
			onSubmit={onSubmit}
			wrapperClassName={wrapperClassName}
		/>
	);

	const reset = () => {
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setBrowseSeed(getRandomBrowseSeed());
		setFilters(DEFAULT_FILTERS);
		setQuery("");
		setSearchboxText("");
		setSearchError(null);
	};

	const searchWithFilters = (
		<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: "1 1 auto", minWidth: 0, height: "100%" }}>
			<div style={{ display: "flex", alignItems: "center", gap: "12px", height: "50%" }}>
				{renderSearchbar()}
				<span className="yalies_nav_search_meta">
					{isSearching ? "Searching..." : resultsLabel}
				</span>
			</div>
			<Filters
				filters={filters || {}}
				setFilterValue={setFilterValue}
				reset={reset}
				filtersAreDefault={filtersAreDefault}
				open={true}
			/>
		</div>
	);

	const compactSearchPanel = (
		<div className={styles.compact_search_panel}>
			<div className={styles.compact_card}>
				<div className={styles.compact_header}>
					<div className={styles.compact_actions}>
						<button
							type="button"
							className={styles.compact_reset}
							onClick={reset}
							disabled={filtersAreDefault}
						>
							Reset filters
						</button>
						<button
							type="button"
							className={`${styles.compact_toggle} ${compactFiltersOpen ? styles.open : ""}`}
							onClick={() => setCompactFiltersOpen((open) => !open)}
							aria-label={compactFiltersOpen ? "Hide filters" : "Show filters"}
							aria-expanded={compactFiltersOpen}
						>
							<FontAwesomeIcon icon={faCaretUp} />
						</button>
					</div>
					<span className={styles.compact_results}>
						{isSearching ? "Searching..." : resultsLabel}
					</span>
				</div>
				<div className={styles.compact_search}>
					{renderSearchbar(styles.compact_searchbar)}
				</div>
				<div className={`${styles.compact_filters} ${compactFiltersOpen ? styles.compact_filters_open : ""}`}>
					<Filters
						filters={filters || {}}
						setFilterValue={setFilterValue}
						reset={reset}
						filtersAreDefault={filtersAreDefault}
						open={true}
					/>
				</div>
			</div>
		</div>
	);

	return (
		<>
			<Topbar>
				<Navbar
					middleContent={isCompact ? undefined : searchWithFilters}
					isAuthenticated={true}
					onLogoClick={reset}
					onFeelingLucky={onFeelingLucky}
				/>
			</Topbar>
			{isClient && isCompact && compactSearchPanel}
			{searchError && (
				<div style={{ textAlign: "center", padding: "20px", color: "#dc3545" }}>
					{searchError}
				</div>
			)}
			{showBirthdays && <BirthdaySection people={birthdayPeople} />}
			<PeopleGrid
				people={people}
				loadMoreFunction={getPeople}
				hasReachedEnd={hasReachedEnd}
				isSearching={isSearching}
				sectionTitle={showBirthdays ? "Some Cool People" : undefined}
			/>
			{luckyPerson && (
				<PersonModal
					person={luckyPerson}
					onClose={() => setLuckyPerson(null)}
				/>
			)}
		</>
	);
}
