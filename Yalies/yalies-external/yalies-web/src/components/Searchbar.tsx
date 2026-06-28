import styles from "./searchbar.module.scss";

export type SearchMode = "full_name" | "first_name" | "last_name" | "initials";

export default function Searchbar({
	value,
	onChange,
	onClear,
	onSubmit,
	searchMode = "full_name",
	onSearchModeChange,
	wrapperClassName,
}: {
	value: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClear?: () => void;
	onSubmit: () => void;
	searchMode?: SearchMode;
	onSearchModeChange?: (mode: SearchMode) => void;
	wrapperClassName?: string;
}) {
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			onSubmit();
		}
	};

	const searchModeOptions: { mode: SearchMode; label: string }[] = [
		{ mode: "full_name", label: "Search full name" },
		{ mode: "first_name", label: "Search first name" },
		{ mode: "last_name", label: "Search last name" },
		{ mode: "initials", label: "Search initials" },
	];

	return (
		<div className={`${styles.search_wrapper} ${wrapperClassName ?? ""}`}>
			<div className={styles.search_input_container}>
				<input
					className={styles.search_input}
					placeholder="Search Yalies"
					value={value}
					onChange={onChange}
					onKeyDown={handleKeyDown}
					autoComplete="off"
				/>
				{value.length > 0 && onClear && (
					<button
						type="button"
						className={styles.clear_button}
						onClick={() => {
							onClear();
						}}
						aria-label="Clear search"
					>
						&times;
					</button>
				)}
			</div>
			{onSearchModeChange && value.trim().length >= 2 && (
				<div className={styles.search_mode_options}>
					{searchModeOptions.map(({ mode, label }) => (
						<button
							key={mode}
							type="button"
							className={`${styles.search_mode_option} ${searchMode === mode ? styles.active : ""}`}
							onClick={() => onSearchModeChange(mode)}
						>
							{label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
