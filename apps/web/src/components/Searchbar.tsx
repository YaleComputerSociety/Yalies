"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./searchbar.module.scss";

export default function Searchbar({
	value,
	onChange,
	onClear,
	onSubmit,
	wrapperClassName,
	placeholder = "Search Yalies",
	autoFocus = false,
	enableShortcut = false,
	isSearching = false,
}: {
	value: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClear?: () => void;
	onSubmit: () => void;
	wrapperClassName?: string;
	placeholder?: string;
	autoFocus?: boolean;
	enableShortcut?: boolean;
	isSearching?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isMac, setIsMac] = useState<boolean | null>(null);
	const [showKeyboardHint, setShowKeyboardHint] = useState(false);
	const [progressVisible, setProgressVisible] = useState(isSearching);

	useEffect(() => {
		if (isSearching) {
			setProgressVisible(true);
			return;
		}
		const timeout = setTimeout(() => setProgressVisible(false), 550);
		return () => clearTimeout(timeout);
	}, [isSearching]);
	const showClear = value.length > 0 && !!onClear;
	const showShortcut = enableShortcut && isMac !== null && showKeyboardHint && !showClear;

	useEffect(() => {
		if (!enableShortcut) return;
		setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
		// Advertise keyboard shortcuts only for desktop-style input, not touch-first devices.
		const desktopInput = window.matchMedia("(hover: hover) and (pointer: fine)");
		const updateKeyboardHint = () => setShowKeyboardHint(desktopInput.matches);
		updateKeyboardHint();
		desktopInput.addEventListener("change", updateKeyboardHint);
		const focusSearch = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing || event.key.toLowerCase() !== "k") return;
			event.preventDefault();
			const input = inputRef.current;
			input?.focus();
			if (input?.value.length) input.select();
		};
		window.addEventListener("keydown", focusSearch);
		return () => {
			window.removeEventListener("keydown", focusSearch);
			desktopInput.removeEventListener("change", updateKeyboardHint);
		};
	}, [enableShortcut]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			onSubmit();
		}
	};

	return (
		<div className={`${styles.search_wrapper} ${wrapperClassName ?? ""}`}>
			<div className={styles.search_input_container}>
				<input
					ref={inputRef}
					className={`${styles.search_input} ${showShortcut ? styles.with_shortcut : ""}`}
					placeholder={placeholder}
					aria-label={placeholder}
					aria-keyshortcuts={enableShortcut && isMac !== null ? (isMac ? "Meta+K" : "Control+K") : undefined}
					value={value}
					onChange={onChange}
					onKeyDown={handleKeyDown}
					autoComplete="off"
					autoFocus={autoFocus}
				/>
				{showClear ? (
					<button
						type="button"
						className={styles.clear_button}
						onClick={() => {
							onClear?.();
							inputRef.current?.focus();
						}}
						aria-label="Clear search"
					>
						&times;
					</button>
				) : showShortcut && (
					<span className={styles.shortcut_hint} aria-hidden="true">
						<kbd>{isMac ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd>
					</span>
				)}
			</div>
			{(isSearching || progressVisible) && (
				<div className={styles.search_progress} aria-hidden="true">
					<div className={isSearching ? styles.progress_loading : styles.progress_complete} />
				</div>
			)}
		</div>
	);
}
