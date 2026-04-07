"use client";

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

export default function Searchbar({
	value,
	onChange,
	onClear,
	onSubmit,
	onSelectPerson,
}: {
	value: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClear?: () => void;
	onSubmit: () => void;
	onSelectPerson?: (netid: string, school?: string) => void;
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
		fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.people}`, {
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
				`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.peopleSuggest}?q=${encodeURIComponent(query.trim())}`,
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
			setSuggestions(data);
			setShowSuggestions(data.length > 0);
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

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setSelectedIndex((prev) =>
					prev < suggestions.length - 1 ? prev + 1 : 0
				);
				break;
			case "ArrowUp":
				e.preventDefault();
				setSelectedIndex((prev) =>
					prev > 0 ? prev - 1 : suggestions.length - 1
				);
				break;
			case "Enter":
				e.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
					handleSelect(suggestions[selectedIndex]);
				} else {
					onSubmit();
					setShowSuggestions(false);
				}
				break;
			case "Escape":
				setShowSuggestions(false);
				setSelectedIndex(-1);
				break;
		}
	};

	const handleFocus = () => {
		if (suggestions.length > 0 && value.trim().length >= 2) {
			setShowSuggestions(true);
		}
	};

	return (
		<div id={styles.search_wrapper} ref={wrapperRef}>
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
			{showSuggestions && suggestions.length > 0 && (
				<div className={styles.suggestions_dropdown}>
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
								<span className={styles.suggestion_details}>
									{[
										suggestion.college,
										suggestion.year && `'${String(suggestion.year).slice(-2)}`,
										!suggestion.college && suggestion.school,
									].filter(Boolean).join(" · ")}
								</span>
							</div>
						</div>
					))}
					<div
						className={styles.suggestion_footer}
						onMouseDown={(e) => {
							e.preventDefault();
							onSubmit();
							setShowSuggestions(false);
						}}
					>
						Search for &ldquo;{value.trim()}&rdquo;
					</div>
				</div>
			)}
		</div>
	);
}
