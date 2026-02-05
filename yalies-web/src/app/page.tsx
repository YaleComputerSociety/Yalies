"use client";
import PeopleGrid from "@/components/PeopleGrid";
import { useEffect, useState } from "react";
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

	useEffect(() => {
		setIsClient(true);
	}, []);

	const getPeople = async () => {
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
		if(newPeople.length === 0) {
			setHasReachedEnd(true);
			return;
		}
		setPeople([...people, ...newPeople]);
		setCurrentPage(currentPage + 1);
	};

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

	const searchbar = (
		<Searchbar
			value={searchboxText}
			onChange={onQueryChange}
			onSubmit={onSubmit}
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
			<PeopleGrid
				people={peopleToDisplay}
				loadMoreFunction={getPeople}
				hasReachedEnd={hasReachedEnd}
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
			<PeopleGrid
				people={peopleToDisplay}
				loadMoreFunction={getPeople}
				hasReachedEnd={hasReachedEnd}
			/>
		</>
	);
}
