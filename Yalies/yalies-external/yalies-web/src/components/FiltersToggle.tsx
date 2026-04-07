"use client";

import styles from "./filters.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

export default function FiltersToggle({
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
