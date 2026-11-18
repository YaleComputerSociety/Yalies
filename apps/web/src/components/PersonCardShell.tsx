"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { type Person } from "yalies-shared";
import CardYaleMoji from "./CardYaleMoji";
import { getExpandedYaleMoji, setExpandedYaleMoji, subscribeExpandedYaleMoji } from "@/hooks/expandedYaleMoji";
import styles from "./peoplegrid.module.scss";
import { useSession } from "./NavigationShell";

export default function PersonCardShell({ person, onOpen, children }: {
	person: Person;
	onOpen: () => void;
	children: ReactNode;
}) {
	const { netid } = useSession();
	const showDefaultAvatar = Boolean(netid && person.netid === netid);
	const cardId = useId();
	const activeCard = useSyncExternalStore(subscribeExpandedYaleMoji, getExpandedYaleMoji, () => null);
	const expanded = activeCard === cardId;
	const setExpanded = (next: boolean) => setExpandedYaleMoji(cardId, next);
	useEffect(() => () => setExpandedYaleMoji(cardId, false), [cardId]);
	return <div
		className={styles.person}
		data-yalemoji-expanded={expanded}
		data-has-yalemoji={!!person.yalemoji?.png_url || showDefaultAvatar}
		onClick={() => {
			if(expanded) setExpanded(false);
			else onOpen();
		}}
	>
		<div
			className={styles.card_content}
			aria-hidden={expanded || undefined}
			ref={element => { if(element) element.inert = expanded; }}
		>
			{children}
		</div>
		<CardYaleMoji person={person} showDefaultAvatar={showDefaultAvatar} expanded={expanded} onExpandedChange={setExpanded} />
	</div>;
}
