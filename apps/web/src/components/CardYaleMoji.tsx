"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type Person } from "yalies-shared";
import styles from "./peoplegrid.module.scss";

const DEFAULT_AVATAR = "https://www.yalemoji.com/assets/default-avatar.png?v=3";

export default function CardYaleMoji({ person, expanded, onExpandedChange, showDefaultAvatar = false }: {
	person: Person;
	showDefaultAvatar?: boolean;
	expanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
}) {
	const [showDefaultTooltip, setShowDefaultTooltip] = useState(false);
	const tooltipId = useId();
	const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => {
		if(tooltipTimer.current) clearTimeout(tooltipTimer.current);
	}, []);
	const hideDefaultTooltip = () => {
		if(tooltipTimer.current) clearTimeout(tooltipTimer.current);
		setShowDefaultTooltip(false);
	};
	const [failedSource, setFailedSource] = useState<string | null>(null);
	const avatarSource = person.yalemoji?.png_url;
	const isDefault = !avatarSource || avatarSource === failedSource;
	const source = isDefault ? DEFAULT_AVATAR : avatarSource;
	if(isDefault && !showDefaultAvatar) return null;
	const image = <img
		className={`${styles.yalemoji} ${isDefault ? styles.yalemoji_default : ""}`}
		src={source}
		alt=""
		width={isDefault ? 56 : 64}
		height={isDefault ? 56 : 64}
		loading="lazy"
		decoding="async"
		draggable={false}
		onError={() => {
			if(!isDefault) {
				setFailedSource(source);
				onExpandedChange(false);
			}
		}}
	/>;
	return <>
		{!isDefault && person.yalemoji?.background_url && <span
			className={styles.yalemoji_background}
			style={{ backgroundImage: `url(${JSON.stringify(person.yalemoji.background_url)})` }}
			aria-hidden="true"
		/>}
		{isDefault ? <>
			<button
				type="button"
				className={styles.yalemoji_default_button}
				aria-label={`Yalemoji status for ${person.first_name} ${person.last_name}`}
				aria-describedby={showDefaultTooltip ? tooltipId : undefined}
				onClick={event => {
					event.stopPropagation();
					if(tooltipTimer.current) clearTimeout(tooltipTimer.current);
					setShowDefaultTooltip(true);
					tooltipTimer.current = setTimeout(() => setShowDefaultTooltip(false), 2500);
				}}
				onBlur={hideDefaultTooltip}
				onKeyDown={event => {
					if(event.key === "Escape") {
						event.stopPropagation();
						hideDefaultTooltip();
					}
				}}
			>
				{image}
			</button>
			<span
				id={tooltipId}
				role="tooltip"
				className={styles.yalemoji_tooltip}
				data-visible={showDefaultTooltip}
				aria-hidden={!showDefaultTooltip}
			>
				No Yalemoji yet
			</span>
		</> : <button
			type="button"
			className={styles.yalemoji_button}
			aria-label={`${expanded ? "Collapse" : "Expand"} ${person.first_name} ${person.last_name}'s Yalemoji`}
			aria-expanded={expanded}
			onClick={event => {
				event.stopPropagation();
				onExpandedChange(!expanded);
			}}
			onKeyDown={event => {
				if(event.key === "Escape" && expanded) {
					event.stopPropagation();
					onExpandedChange(false);
				}
			}}
		>
			{image}
		</button>}
	</>;
}
