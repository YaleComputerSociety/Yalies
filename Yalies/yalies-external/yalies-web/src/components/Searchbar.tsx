"use client";
import { API_URL } from "@/consts";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./searchbar.module.scss";
import { API } from "yalies-shared";

export type Suggestion = {
	netid: string;
	first_name: string;
	last_name: string;
	image?: string;
	college?: string;
	year?: number;
	school?: string;
};

export type SearchMode = "full_name" | "first_name" | "last_name" | "initials";

function formatSuggestionDetails(suggestion: Suggestion) {
	if (!suggestion.college || !suggestion.year) return "";
	return `${suggestion.college} '${String(suggestion.year).slice(-2)}`;
}

export default function Searchbar({
	value,
	onChange,
	onClear,
	onSubmit,
	onSelectPerson,
	searchMode = "full_name",
	onSearchModeChange,
	wrapperClassName,
}: {
	value: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClear?: () => void;
	onSubmit: () => void;
	onSelectPerson?: (netid: string, school?: string) => void;
	searchMode?: SearchMode;
	onSearchModeChange?: (mode: SearchMode) => void;
	wrapperClassName?: string;
}) {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [isLoading, setIsLoading] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const prefetchedRef = useRef<Set<string>>(new Set());

	const prefetchPerson = useCallback((netid: string) => {
		if (prefetchedRef.current.has(netid)) return;
		prefetchedRef.current.add(netid);
		fetch(`${API_URL}${API.people}`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				filters: { netid: [netid] },
				page: 0,
				page_size: 1,
			}),
		}).catch(() => {
			prefetchedRef.current.delete(netid);
		});
	}, []);

	const fetchSuggestions = useCallback(async (query: string) => {
		if (query.trim().length < 2) {
			setSuggestions([]);
			setShowSuggestions(false);
			return;
		}

		if (abortRef.current) {
			abortRef.current.abort();
		}
		abortRef.current = new AbortController();

		setIsLoading(true);
		try {
			const response = await fetch(
				`${API_URL}${API.peopleSuggest}?q=${encodeURIComponent(query.trim())}`,
				{
					credentials: "include",
					signal: abortRef.current.signal,
				}
			);
			if (!response.ok) {
				setSuggestions([]);
				return;
			}
			const data: Suggestion[] = await response.json();
			setSuggestions(data.slice(0, 5));
			setShowSuggestions(true);
			setSelectedIndex(-1);
		} catch (e) {
			if ((e as Error).name !== "AbortError") {
				setSuggestions([]);
				setShowSuggestions(false);
			}
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		debounceRef.current = setTimeout(() => {
			fetchSuggestions(value);
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [value, fetchSuggestions]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
				setShowSuggestions(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleSelect = (suggestion: Suggestion) => {
		setShowSuggestions(false);
		if (onSelectPerson) {
			onSelectPerson(suggestion.netid, suggestion.school);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!showSuggestions || suggestions.length === 0) {
			if (e.key === "Enter") {
				onSubmit();
				setShowSuggestions(false);
			}
			return;
		}

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) =>
				prev < suggestions.length - 1 ? prev + 1 : 0
			);
			return;
		}

		if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((prev) =>
				prev > 0 ? prev - 1 : suggestions.length - 1
			);
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
			if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
				handleSelect(suggestions[selectedIndex]);
			} else {
				onSubmit();
				setShowSuggestions(false);
			}
			return;
		}

		if (e.key === "Escape") {
			setShowSuggestions(false);
			setSelectedIndex(-1);
		}
	};

	const handleFocus = () => {
		if (value.trim().length >= 2) {
			setShowSuggestions(true);
		}
	};

	const searchModeOptions: { mode: SearchMode; label: string }[] = [
		{ mode: "full_name", label: "Search full name" },
		{ mode: "first_name", label: "Search first name" },
		{ mode: "last_name", label: "Search last name" },
		{ mode: "initials", label: "Search initials" },
	];

	return (
		<div className={`${styles.search_wrapper} ${wrapperClassName ?? ""}`} ref={wrapperRef}>
			<div className={styles.search_input_container}>
				<input
					className={styles.search_input}
					placeholder="Search Yalies"
					value={value}
					onChange={onChange}
					onKeyDown={handleKeyDown}
					onFocus={handleFocus}
					autoComplete="off"
				/>
				{value.length > 0 && onClear && (
					<button
						type="button"
						className={styles.clear_button}
						onClick={() => {
							onClear();
							setSuggestions([]);
							setShowSuggestions(false);
						}}
						aria-label="Clear search"
					>
						&times;
					</button>
				)}
				{isLoading && value.trim().length >= 2 && (
					<div className={styles.loading_indicator} />
				)}
			</div>
			{showSuggestions && value.trim().length >= 2 && (
				<div className={styles.suggestions_dropdown}>
					{onSearchModeChange && (
						<div className={styles.search_mode_options}>
							{searchModeOptions.map(({ mode, label }) => (
								<button
									key={mode}
									type="button"
									className={`${styles.search_mode_option} ${searchMode === mode ? styles.active : ""}`}
									onMouseDown={(e) => {
										e.preventDefault();
										onSearchModeChange(mode);
										setShowSuggestions(false);
									}}
								>
									{label}
								</button>
							))}
						</div>
					)}
					{suggestions.length > 0 && (
						<>
							{suggestions.map((suggestion, index) => (
								<div
									key={suggestion.netid}
									className={`${styles.suggestion_item} ${index === selectedIndex ? styles.selected : ""}`}
									onMouseDown={(e) => {
										e.preventDefault();
										handleSelect(suggestion);
									}}
									onMouseEnter={() => {
										setSelectedIndex(index);
										prefetchPerson(suggestion.netid);
									}}
								>
									<img
										className={styles.suggestion_image}
										src={suggestion.image || "/no_image.png"}
										alt=""
										loading="lazy"
										decoding="async"
									/>
									<div className={styles.suggestion_info}>
										<span className={styles.suggestion_name}>
											{suggestion.first_name} {suggestion.last_name}
										</span>
										{formatSuggestionDetails(suggestion) && (
											<span className={styles.suggestion_details}>
												{formatSuggestionDetails(suggestion)}
											</span>
										)}
									</div>
								</div>
							))}
						</>
					)}
					{!isLoading && suggestions.length === 0 && (
						<div className={styles.no_suggestions}>
							No matching suggestions
						</div>
					)}
				</div>
			)}
		</div>
	);
}
