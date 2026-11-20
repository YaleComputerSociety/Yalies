"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { type Person } from "yalies-shared";
import CardYaleMoji from "./CardYaleMoji";
import { getExpandedYaleMoji, setExpandedYaleMoji, subscribeExpandedYaleMoji } from "@/hooks/expandedYaleMoji";
import styles from "./peoplegrid.module.scss";
import { useSession } from "./NavigationShell";

export default function PersonCardShell({ person, onOpen, children, notePreview }: {
	person: Person;
	onOpen: () => void;
	children: ReactNode;
	notePreview?: string | null;
}) {
	const { netid } = useSession();
	const showDefaultAvatar = Boolean(netid && person.netid === netid);
	const cardId = useId();
	const activeCard = useSyncExternalStore(subscribeExpandedYaleMoji, getExpandedYaleMoji, () => null);
	const expanded = activeCard === cardId;
	const setExpanded = (next: boolean) => setExpandedYaleMoji(cardId, next);
	useEffect(() => () => setExpandedYaleMoji(cardId, false), [cardId]);
	const card = <div
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
	if(!notePreview?.trim()) return card;
	return <div className={styles.person_with_note}>
		{card}
		<button type="button" className={styles.note_preview} onClick={onOpen}
			aria-label={`Read private note for ${person.first_name} ${person.last_name}`}>
			<span>{notePreview}</span>
		</button>
	</div>;
}
