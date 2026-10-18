"use client";

import styles from "./chip.module.scss";
import { CSSProperties, useRef, useState } from "react";

export default function ClickableChip({
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
