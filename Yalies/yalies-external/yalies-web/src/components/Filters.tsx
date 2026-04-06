"use client";

import styles from "./filters.module.scss";
import Dropdown, { DropdownOption } from "./Dropdown";
import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";
import { API, YALE_COLLEGE } from "yalies-shared";

export function FiltersToggle({
	filtersAreDefault,
	activeFilterCount,
	open,
	onToggle,
}: {
	filtersAreDefault: boolean;
	activeFilterCount: number;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			className={`${styles.filters_toggle} ${!filtersAreDefault ? styles.has_filters : ""} ${open ? styles.open : ""}`}
			onClick={onToggle}
		>
			<FontAwesomeIcon icon={faSliders} />
			<span>Filters</span>
			{!filtersAreDefault && (
				<span className={styles.badge}>{activeFilterCount}</span>
			)}
		</button>
	);
}

export default function Filters({
	filters,
	setFilterValue,
	reset,
	filtersAreDefault,
	open,
}: {
	filters: Record<string, string[]>;
	setFilterValue: (key: string, newValue: string[]) => void;
	reset: () => void;
	filtersAreDefault: boolean;
	open: boolean;
}) {
	const [schoolOptions, setSchoolOptions] = useState<DropdownOption[]>([
		{ label: YALE_COLLEGE, value: YALE_COLLEGE },
	]);
	const [yearOptions, setYearOptions] = useState<DropdownOption[]>([]);
	const [collegeOptions, setCollegeOptions] = useState<DropdownOption[]>([]);
	const [majorOptions, setMajorOptions] = useState<DropdownOption[]>([]);
	const [locationOptions, setLocationOptions] = useState<DropdownOption[]>([]);

	const getFilters = useCallback(async () => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.filters}`, {
				headers: {
					"Content-Type": "application/json",
				},
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
			console.error("Error fetching filters", response.status, response.statusText, await response.text());
			return;
		}
		const filterOptions: Record<string, unknown[]> = await response?.json();

		const filterToDropdownOption = (options: unknown[], sort?: (a: DropdownOption, b: DropdownOption) => number): DropdownOption[] => {
			return (options as string[])
				.map((option) => ({ label: option.toString(), value: option.toString() }))
				.sort(sort || ((a, b) => a.label.localeCompare(b.label)));
		};

		const schoolSortFn = (a: DropdownOption, b: DropdownOption) => {
			if(a.label === YALE_COLLEGE) return -1;
			if(b.label === YALE_COLLEGE) return 1;
			return a.label.localeCompare(b.label);
		};
		const yearSortFn = (a: DropdownOption, b: DropdownOption) => {
			const stringA = a.label.toString();
			const stringB = b.label.toString();
			return -1 * stringA.localeCompare(stringB);
		}

		const locationSortFn = (a: DropdownOption, b: DropdownOption) => {
			if(a.label === "United States") return -1;
			if(b.label === "United States") return 1;
			return a.label.localeCompare(b.label);
		};

		setSchoolOptions(filterToDropdownOption(filterOptions["school"], schoolSortFn));
		setYearOptions(filterToDropdownOption(filterOptions["year"], yearSortFn));
		setCollegeOptions(filterToDropdownOption(filterOptions["college"]));
		setMajorOptions(filterToDropdownOption(filterOptions["major"]));
		if(filterOptions["address_country"]) {
			setLocationOptions(filterToDropdownOption(filterOptions["address_country"], locationSortFn));
		}
	}, []);

	useEffect(() => {
		getFilters();
	}, [getFilters]);

	if(!open) return null;

	return (
		<div className={styles.filters_panel}>
			<div className={styles.filters_row}>
				<Dropdown
					label="School"
					options={schoolOptions}
					value={filters?.school || []}
					onValueChange={(val) => setFilterValue("school", val)}
				/>
				<Dropdown
					label="Year"
					options={yearOptions}
					value={filters?.year || []}
					onValueChange={(val) => setFilterValue("year", val)}
				/>
				<Dropdown
					label="College"
					options={collegeOptions}
					value={filters?.college || []}
					onValueChange={(val) => setFilterValue("college", val)}
				/>
				<Dropdown
					label="Major"
					options={majorOptions}
					value={filters?.major || []}
					onValueChange={(val) => setFilterValue("major", val)}
				/>
				<Dropdown
					label="Location"
					options={locationOptions}
					value={filters?.address_country || []}
					onValueChange={(val) => setFilterValue("address_country", val)}
				/>
				{!filtersAreDefault && (
					<button className={styles.reset} onClick={reset}>
						Reset
					</button>
				)}
			</div>
		</div>
	);
};
