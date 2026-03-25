"use client";
import PeopleGrid from "@/components/PeopleGrid";
import { useEffect, useState, useCallback } from "react";
import { Person } from "../../../yalies-shared/datatypes";
import Navbar from "@/components/Navbar";
import Filters from "@/components/Filters";
import Topbar from "@/components/Topbar";
import Splash from "@/components/Splash";
import Searchbar from "@/components/Searchbar";
import { isMobile } from "@/consts";
import { sendGAEvent } from "@next/third-parties/google";

export default function HomePage() {
	const DEFAULT_FILTERS = {
		school: ["Yale College"],
		year: [],
		college: [],
		major: [],
	};
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [people, setPeople] = useState<Person[]>([]);
	const [birthdayPeople, setBirthdayPeople] = useState<Person[]>([]);
	const [hasReachedEnd, setHasReachedEnd] = useState(false);
	const [currentPage, setCurrentPage] = useState(0);
	const [filters, setFilters] = useState<Record<string, string[]> | null>(DEFAULT_FILTERS);
	// query <- searchboxText on enter key
	const [searchboxText, setSearchboxText] = useState("");
	const [query, setQuery] = useState("");
	const [isClient, setIsClient] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);

	useEffect(() => {
		setIsClient(true);
	}, []);

	const getPeople = useCallback(async () => {
		if(hasReachedEnd) return;
		if(filters === null) return;
		let response;

		let queryActual = query;
		// Construct the filter object.
		// We have to do this because Sequelize treats empty array
		// as only allowing null values to pass through the filter
		let filterObject: Record<string, string[]> = {};
		if(filters.year && filters.year.length > 0) filterObject.year = filters.year;
		if(filters.school && filters.school.length > 0) filterObject.school = filters.school;
		if(filters.college && filters.college.length > 0) filterObject.college = filters.college;
		if(filters.major && filters.major.length > 0) filterObject.major = filters.major;

		if(queryActual.match(/^[a-z]{2,}\d{1,4}$/i)) {
			// This is a netID
			queryActual = "";
			filterObject = {
				netid: [query],
				...filterObject,
			};
		} else if(queryActual.match(/^\d{8}$/i)) {
			// This is a UPI
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
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/people`, {
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
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasReachedEnd, filters, query, currentPage]);

	const getTodaysBirthdays = async () => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/people`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					filters: {
						school: "Yale College",
						birth_day: new Date().getDate(),
						birth_month: new Date().getMonth() + 1,
					},
					page_size: 100,
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

	useEffect(() => { // TODO: Convert to use SWR
		getTodaysBirthdays();
	}, []);

	useEffect(() => { // TODO: Convert to use SWR
		getPeople();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters, query]);

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
		filters.school[0] === "Yale College" &&
		filters.year && filters.year.length === 0 &&
		filters.college && filters.college.length === 0 &&
		filters.major && filters.major.length === 0 &&
		query.length === 0
	);

	const peopleToDisplay = (filtersAreDefault && query.length === 0) ? [
		...birthdayPeople,
		...people,
	] : people;

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
		// Fetch this specific person and display them
		setSearchboxText("");
		setQuery("");
		setPeople([]);
		setHasReachedEnd(false);
		setCurrentPage(0);
		setIsSearching(true);
		setSearchError(null);

		// Clear school filter so non-Yale College people are visible
		if (school && school !== "Yale College") {
			setFilters((prev) => ({ ...prev, school: [] }));
		}

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/people`, {
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

	if(isMobile() && isClient) return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} onLogoClick={reset} />
			</Topbar>
			{searchbar}
			<Filters
				filters={filters || {}}
				setFilterValue={setFilterValue}
				reset={reset}
				filtersAreDefault={filtersAreDefault}
			/>
			{searchError && (
				<div style={{ textAlign: "center", padding: "20px", color: "#dc3545" }}>
					{searchError}
				</div>
			)}
			<PeopleGrid
				people={peopleToDisplay}
				loadMoreFunction={getPeople}
				hasReachedEnd={hasReachedEnd}
				isSearching={isSearching}
			/>
		</>
	);

	return (
		<>
			<Topbar>
				<Navbar middleContent={searchbar} isAuthenticated={true} onLogoClick={reset} />
				<Filters
					filters={filters || {}}
					setFilterValue={setFilterValue}
					reset={reset}
					filtersAreDefault={filtersAreDefault}
				/>
			</Topbar>
			{searchError && (
				<div style={{ textAlign: "center", padding: "20px", color: "#dc3545" }}>
					{searchError}
				</div>
			)}
			<PeopleGrid
				people={peopleToDisplay}
				loadMoreFunction={getPeople}
				hasReachedEnd={hasReachedEnd}
				isSearching={isSearching}
			/>
		</>
	);
}
