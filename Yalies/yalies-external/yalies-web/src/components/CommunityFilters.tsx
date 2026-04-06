"use client";

import styles from "./communityfilters.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders, faXmark } from "@fortawesome/free-solid-svg-icons";
import { POST_TYPES, CATEGORIES, COMMON_TAGS } from "@/lib/communityTypes";

export function CommunityFiltersToggle({
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

export default function CommunityFilters({
	type,
	category,
	tags,
	onTypeChange,
	onCategoryChange,
	onTagsChange,
	onReset,
	open,
}: {
	type: string;
	category: string;
	tags: string[];
	onTypeChange: (type: string) => void;
	onCategoryChange: (category: string) => void;
	onTagsChange: (tags: string[]) => void;
	onReset: () => void;
	open: boolean;
}) {
	if(!open) return null;

	const hasActiveFilters = type || category || tags.length > 0;

	return (
		<div className={styles.filters_panel}>
			<div className={styles.filter_row}>
				<span className={styles.label}>Type</span>
				<div className={styles.options}>
					{POST_TYPES.map(t => (
						<button
							key={t.value}
							className={`${styles.filter_chip} ${type === t.value ? styles.selected : ""}`}
							onClick={() => onTypeChange(type === t.value ? "" : t.value)}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>
			<div className={styles.filter_row}>
				<span className={styles.label}>Category</span>
				<div className={styles.options}>
					{CATEGORIES.map(c => (
						<button
							key={c.value}
							className={`${styles.filter_chip} ${category === c.value ? styles.selected : ""}`}
							onClick={() => onCategoryChange(category === c.value ? "" : c.value)}
						>
							{c.label}
						</button>
					))}
				</div>
			</div>
			<div className={styles.filter_row}>
				<span className={styles.label}>Skills</span>
				<div className={styles.options}>
					{COMMON_TAGS.map(tag => (
						<button
							key={tag}
							className={`${styles.filter_chip} ${tags.includes(tag) ? styles.selected : ""}`}
							onClick={() => {
								if(tags.includes(tag)) {
									onTagsChange(tags.filter(t => t !== tag));
								} else {
									onTagsChange([...tags, tag]);
								}
							}}
						>
							{tag}
						</button>
					))}
				</div>
			</div>
			{hasActiveFilters && (
				<button className={styles.reset_button} onClick={onReset}>
					<FontAwesomeIcon icon={faXmark} />
					Reset filters
				</button>
			)}
		</div>
	);
}
