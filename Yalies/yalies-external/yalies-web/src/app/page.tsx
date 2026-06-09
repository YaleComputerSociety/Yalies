"use client";
import { API_URL } from "@/consts";
import PeopleGrid from "@/components/PeopleGrid";
import { useEffect, useState, useCallback, useRef } from "react";
import { Person, API, YALE_COLLEGE } from "yalies-shared";
import Navbar from "@/components/Navbar";
import Filters from "@/components/Filters";
import FiltersToggle from "@/components/FiltersToggle";
import Topbar from "@/components/Topbar";
import Splash from "@/components/Splash";
import Searchbar from "@/components/Searchbar";
import BirthdaySection from "@/components/BirthdaySection";
import { isMobile } from "@/consts";
import { sendGAEvent } from "@next/third-parties/google";
import { getHomeCache, setHomeCache } from "@/hooks/useHomeCache";

export default function HomePage() {
	const DEFAULT_FILTERS = {
		school: [YALE_COLLEGE],
		year: [],
		college: [],
		major: [],
		address_country: [],
	};

	const homeCache = getHomeCache();

	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [people, setPeople] = useState<Person[]>(homeCache?.people ?? []);
	const [birthdayPeople, setBirthdayPeople] = useState<Person[]>(homeCache?.birthdayPeople ?? []);
	const [hasReachedEnd, setHasReachedEnd] = useState(homeCache?.hasReachedEnd ?? false);
	const [currentPage, setCurrentPage] = useState(homeCache?.currentPage ?? 0);
	const [filters, setFilters] = useState<Record<string, string[]> | null>(homeCache?.filters ?? DEFAULT_FILTERS);

	const [searchboxText, setSearchboxText] = useState(homeCache?.query ?? "");
	const [query, setQuery] = useState(homeCache?.query ?? "");
	const [isClient, setIsClient] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const restoredFromCache = useRef(!!homeCache);

	useEffect(() => {
		setIsClient(true);
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
		if(filters.address_country && filters.address_country.length > 0) filterObject.address_country = filters.address_country;

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

		try {
			response = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: queryActual.length > 0 ? queryActual : null,
					filters: filterObject,
					page: currentPage,
					page_size: 20,
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
		setPeople((prev) => currentPage === 0 ? newPeople : [...prev, ...newPeople]);
		setCurrentPage((prev) => prev + 1);
		setIsSearching(false);

		if(newPeople.length === 20) {
			fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: queryActual.length > 0 ? queryActual : null,
					filters: filterObject,
					page: currentPage + 1,
					page_size: 20,
				}),
			}).catch(() => {});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasReachedEnd, filters, query, currentPage]);

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
			});
		}
	}, [people, birthdayPeople, filters, query, currentPage, hasReachedEnd]);

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

	const filtersAreDefault = (
		filters !== null &&
		filters.school && filters.school.length === 1 &&
		filters.school[0] === YALE_COLLEGE &&
		filters.year && filters.year.length === 0 &&
		filters.college && filters.college.length === 0 &&
		filters.major && filters.major.length === 0 &&
		filters.address_country && filters.address_country.length === 0
	);

	const showBirthdays = filtersAreDefault && query.length === 0 && birthdayPeople.length > 0 && people.length !== 1;

	const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchboxText(e.target.value);
	};

	const onSubmit = () => {
		if(searchboxText === query) return;
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setQuery(searchboxText);
		sendGAEvent("event", "search", { query: searchboxText });
	}

	const onSelectPerson = async (netid: string, school?: string) => {

		setSearchboxText("");
		setQuery("");
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setIsSearching(true);
		setSearchError(null);

		if (school && school !== YALE_COLLEGE) {
			setFilters((prev) => ({ ...prev, school: [] }));
		}

		try {
			const response = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					filters: { netid: [netid] },
					page: 0,
					page_size: 1,
				}),
			});
			if (response.ok) {
				const results: Person[] = await response.json();
				setPeople(results);
				setHasReachedEnd(true);
			}
		} catch (e) {
			console.error(e);
		} finally {
			setIsSearching(false);
		}
	};

	const searchbar = (
		<Searchbar
			value={searchboxText}
			onChange={onQueryChange}
			onClear={() => {
				setSearchboxText("");
				setQuery("");
				setPeople([]);
				setHasReachedEnd(false);
				setCurrentPage(0);
			}}
			onSubmit={onSubmit}
			onSelectPerson={onSelectPerson}
		/>
	);

	const setFilterValue = (key: string, newValue: string[]) => {
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setFilters({ ...filters, [key]: newValue });
	};

	const reset = () => {
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setFilters(DEFAULT_FILTERS);
		setQuery("");
		setSearchboxText("");
		setSearchError(null);
	};

	const activeFilterCount = (filters?.school?.length || 0) + (filters?.year?.length || 0) + (filters?.college?.length || 0) + (filters?.major?.length || 0) + (filters?.address_country?.length || 0);

	const searchWithFilters = (
		<div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 }}>
			<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
				{searchbar}
				<FiltersToggle
					filtersAreDefault={filtersAreDefault}
					activeFilterCount={activeFilterCount}
					open={filtersOpen}
					onToggle={() => setFiltersOpen(!filtersOpen)}
				/>
			</div>
			<Filters
				filters={filters || {}}
				setFilterValue={setFilterValue}
				reset={reset}
				filtersAreDefault={filtersAreDefault}
				open={filtersOpen}
			/>
		</div>
	);

	const mobile = isClient && isMobile();

	return (
		<>
			<Topbar>
				<Navbar
					middleContent={mobile ? undefined : searchWithFilters}
					isAuthenticated={true}
					onLogoClick={reset}
				/>
			</Topbar>
			{mobile && (
				<>
					{searchbar}
					<Filters
						filters={filters || {}}
						setFilterValue={setFilterValue}
						reset={reset}
						filtersAreDefault={filtersAreDefault}
						open={true}
					/>
				</>
			)}
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
				sectionTitle={showBirthdays ? "Meet New People" : undefined}
			/>
		</>
	);
}
