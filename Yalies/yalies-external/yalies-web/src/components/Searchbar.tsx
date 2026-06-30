import styles from "./searchbar.module.scss";

export default function Searchbar({
	value,
	onChange,
	onClear,
	onSubmit,
	wrapperClassName,
}: {
	value: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClear?: () => void;
	onSubmit: () => void;
	wrapperClassName?: string;
}) {
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
		</div>
	);
}
