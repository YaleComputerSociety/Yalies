"use client";

import styles from "./communityfilters.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";

export default function CommunityFiltersToggle({
	activeCount,
	open,
	onToggle,
}: {
	activeCount: number;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			className={`${styles.filters_toggle} ${open ? styles.active : ""}`}
			onClick={onToggle}
		>
			<FontAwesomeIcon icon={faSliders} />
			Filters
			{activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
		</button>
	);
}
