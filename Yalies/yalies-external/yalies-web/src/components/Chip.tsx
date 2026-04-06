"use client";

import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import styles from "./chip.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CSSProperties, useRef, useState } from "react";

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

export function ClickableChip({
	defaultText,
	clickedText,
	onClick,
}: {
	defaultText: string;
	clickedText: string;
	onClick: () => void;
}) {
	const [clicked, setClicked] = useState(false);
	const [superClicked, setSuperClicked] = useState(false);
	const chipRef = useRef<HTMLButtonElement>(null);
	const [width, setWidth] = useState(0);
	const [timeoutInstance, setTimeoutInstance] = useState<NodeJS.Timeout | null>(null);

	const onChipClick = () => {
		onClick();
		setWidth(chipRef.current?.offsetWidth || 0);
		setClicked(true);
		if(timeoutInstance) {
			clearTimeout(timeoutInstance);
			setSuperClicked(true);
		}
		setTimeoutInstance(setTimeout(() => {
			setClicked(false);
			setSuperClicked(false);
			setTimeoutInstance(null);
		}, 1000));
	};

	const style = clicked ? {width} as CSSProperties : undefined;
	return (
		<button
			className={`
				${styles.chip}
				${styles.primary}
				${styles.clickable}
			`}
			style={style}
			onClick={onChipClick}
			ref={chipRef}
		>
			{superClicked ? "( ˶°ㅁ°) !!" : (clicked ? clickedText : defaultText)}
		</button>
	);
}
