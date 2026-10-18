"use client";

import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import styles from "./chip.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
export default function Chip({
	children,
	primary,
	icon,
	birthday,
	onClick,
	removable,
	onRemove,
}: {
	children: React.ReactNode;
	primary?: boolean;
	birthday?: boolean;
	icon?: IconDefinition;
	onClick?: () => void;
	removable?: boolean;
	onRemove?: () => void;
}) {
	return (
		<button className={`
			${styles.chip}
			${primary ? styles.primary : ""}
			${birthday ? styles.birthday : ""}
			${onClick ? styles.clickable : ""}
		`} onClick={onClick}>
			{ icon && <FontAwesomeIcon icon={icon} /> }
			{children}
			{ removable && (
				<span className={styles.remove} onClick={(e) => { e.stopPropagation(); onRemove?.(); }}>
					&times;
				</span>
			)}
		</button>
	);
}
