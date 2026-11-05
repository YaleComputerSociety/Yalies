"use client";
import { API_URL } from "@/consts";

import styles from "./filters.module.scss";
import Dropdown, { DropdownOption, DropdownSubMenu } from "./Dropdown";
import { useCallback, useEffect, useState } from "react";
import { API, YALE_COLLEGE, US_STATES } from "yalies-shared";
import { filterExclusionUpdate, filterSelectionUpdate, selectedFilterValues } from "@/helpers/filterSelection";

const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];
// Leap-year lengths so Feb 29 birthdays can be found
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const BIRTH_MONTH_OPTIONS: DropdownOption[] = MONTH_NAMES.map((name, i) => ({ label: name, value: String(i + 1) }));

const BIRTH_DAY_SUBMENUS: Record<string, DropdownSubMenu> = Object.fromEntries(
	MONTH_NAMES.map((name, i) => [
		String(i + 1),
		{
			label: name,
			allLabel: `All of ${name}`,
			layout: "grid",
			options: Array.from({ length: DAYS_IN_MONTH[i] }, (_, d) => ({
				label: String(d + 1),
				value: `${i + 1}-${d + 1}`,
				chipLabel: `${name.slice(0, 3)} ${d + 1}`,
			})),
		},
	])
);

export default function Filters({
	filters,
	setFilterValue,
	setFilterValues,
	reset,
	filtersAreDefault,
	open,
}: {
	filters: Record<string, string[]>;
	setFilterValue: (key: string, newValue: string[]) => void;
	setFilterValues: (updates: Record<string, string[]>) => void;
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
	const [countryOptions, setCountryOptions] = useState<DropdownOption[]>([]);
	const [stateOptions, setStateOptions] = useState<DropdownOption[]>([]);

	const getFilters = useCallback(async () => {
		let response;
		try {
			response = await fetch(`${API_URL}${API.filters}`, {
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

		const collegeToDropdownOption = (options: unknown[]): DropdownOption[] => {
			const collegeOrderOverrides: Record<string, string> = {
				"Benjamin Franklin": "Davenport~Benjamin Franklin",
				"Ezra Stiles": "Silliman~Ezra Stiles",
			};
			const collegeSortKey = (option: DropdownOption) => collegeOrderOverrides[option.label] || option.label;
			return (options as string[])
				.map((option) => ({
					label: option.toString().replace(/\s+College$/i, ""),
					value: option.toString(),
				}))
				.sort((a, b) => collegeSortKey(a).localeCompare(collegeSortKey(b)));
		};

		const schoolSortFn = (a: DropdownOption, b: DropdownOption) => {
			if(a.label === YALE_COLLEGE) return -1;
			if(b.label === YALE_COLLEGE) return 1;
			return a.label.localeCompare(b.label);
		};
		const countrySortFn = (a: DropdownOption, b: DropdownOption) => {
			if(a.value === "United States") return -1;
			if(b.value === "United States") return 1;
			return a.label.localeCompare(b.label);
		};
		const yearSortFn =(a: DropdownOption, b: DropdownOption) => {
			const stringA = a.label.toString();
			const stringB = b.label.toString();
			return -1 * stringA.localeCompare(stringB);
		}

		setSchoolOptions(filterToDropdownOption(filterOptions["school"], schoolSortFn));
		setYearOptions(filterToDropdownOption(filterOptions["year"], yearSortFn));
		setCollegeOptions(collegeToDropdownOption(filterOptions["college"]));
		setMajorOptions(filterToDropdownOption(filterOptions["major"]));
		setCountryOptions(filterToDropdownOption(filterOptions["address_country"] ?? [], countrySortFn));
		setStateOptions(
			((filterOptions["address_state"] ?? []) as string[])
				.map((code) => ({ label: US_STATES[code] ?? code, value: code }))
				.sort((a, b) => a.label.localeCompare(b.label))
		);
	}, []);

	useEffect(() => {
		if (open) getFilters();
	}, [getFilters, open]);

	if(!open) return null;

	// birth_date holds whole months ("2") and exact dates ("2-14") in one filter
	const birthDateValues = filters?.birth_date || [];
	const birthMonths = birthDateValues.filter((v) => !v.includes("-"));
	const birthDates = birthDateValues.filter((v) => v.includes("-"));
	const exclusionProps = (field: string) => ({
		value: selectedFilterValues(filters, field),
		excludedValue: filters[`exclude_${field}`] ?? [],
		onValueChange: (selected: string[]) => setFilterValues(filterSelectionUpdate(filters, field, selected)),
		onExcludeToggle: (value: string) => setFilterValues(filterExclusionUpdate(filters, field, value)),
	});
	const toggleCountryExclusion = (value: string) => {
		const update = filterExclusionUpdate(filters, "address_country", value);
		if (value === "United States" && update.exclude_address_country.includes(value)) {
			update.address_state = [];
			update.exclude_address_state = [];
		}
		setFilterValues(update);
	};

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
					{...exclusionProps("year")}
				/>
				<Dropdown
					label="College"
					options={collegeOptions}
					{...exclusionProps("college")}
				/>
				<Dropdown
					label="Major"
					options={majorOptions}
					{...exclusionProps("major")}
				/>
				<Dropdown
					label="Location"
					options={countryOptions}
					{...exclusionProps("address_country")}
					onExcludeToggle={toggleCountryExclusion}
					onSubMenuExcludeToggle={(country) => {
						const states = selectedFilterValues(filters, "address_state");
						if (selectedFilterValues(filters, "address_country").includes(country) || states.length === 0) {
							toggleCountryExclusion(country);
							return;
						}
						const allExcluded = states.every(state => (filters.exclude_address_state ?? []).includes(state));
						setFilterValues({ address_state: allExcluded ? states : [], exclude_address_state: allExcluded ? [] : states });
					}}
					onClear={() => setFilterValues({ address_country: [], exclude_address_country: [], address_state: [], exclude_address_state: [] })}
					onClearSubMenu={(country) => setFilterValues({
						address_country: (filters.address_country ?? []).filter(value => value !== country),
						exclude_address_country: (filters.exclude_address_country ?? []).filter(value => value !== country),
						address_state: [], exclude_address_state: [],
					})}
					subMenus={{
						"United States": { label: "United States", allLabel: "Anywhere in United States", options: stateOptions },
					}}
					subValue={selectedFilterValues(filters, "address_state")}
					excludedSubValue={filters.exclude_address_state ?? []}
					onSubValueChange={(selected) => setFilterValues({
						...filterSelectionUpdate(filters, "address_state", selected),
						...(selected.length > 0 && { exclude_address_country: (filters.exclude_address_country ?? []).filter(value => value !== "United States") }),
					})}
					onSubExcludeToggle={(value) => setFilterValues({
						...filterExclusionUpdate(filters, "address_state", value),
						exclude_address_country: (filters.exclude_address_country ?? []).filter(country => country !== "United States"),
					})}
				/>
				<Dropdown
					label="Birthday"
					options={BIRTH_MONTH_OPTIONS}
					value={birthMonths}
					onValueChange={(val) => setFilterValue("birth_date", [
						...val, ...birthDates.filter(date => !val.includes(date.split("-")[0])),
					])}
					onClear={() => setFilterValue("birth_date", [])}
					subMenus={BIRTH_DAY_SUBMENUS}
					subValue={birthDates}
					onSubValueChange={(val) => setFilterValue("birth_date", [
						...birthMonths.filter(month => !val.some(date => date.split("-")[0] === month)), ...val,
					])}
				/>
				<button
					className={`${styles.reset} ${!filtersAreDefault ? styles.active : ""}`}
					onClick={reset}
					disabled={filtersAreDefault}
				>
					Reset
				</button>
			</div>
		</div>
	);
};
