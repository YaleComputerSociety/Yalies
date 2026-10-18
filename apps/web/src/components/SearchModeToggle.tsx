import styles from "./searchmodetoggle.module.scss";

export type SearchMode = "full_name" | "initials";

export default function SearchModeToggle({ value, onChange }: {
	value: SearchMode;
	onChange: (mode: SearchMode) => void;
}) {
	return (
		<div className={styles.toggle} role="group" aria-label="Search mode">
			{([
				["full_name", "By Name"],
				["initials", "By Initials"],
			] as const).map(([mode, label]) => (
				<button
					key={mode}
					type="button"
					aria-pressed={value === mode}
					onClick={() => onChange(mode)}
				>
					{label}
				</button>
			))}
		</div>
	);
}
