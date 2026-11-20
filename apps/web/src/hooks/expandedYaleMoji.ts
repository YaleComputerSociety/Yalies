// Shared across result grids and birthday cards. Each mounted card owns a
// distinct ID, even when the same person appears in more than one section.
let activeCard: string | null = null;
const listeners = new Set<() => void>();

export function getExpandedYaleMoji(): string | null {
	return activeCard;
}

export function subscribeExpandedYaleMoji(listener: () => void): () => void {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

export function setExpandedYaleMoji(cardId: string, expanded: boolean) {
	if(!expanded && activeCard !== cardId) return;
	const next = expanded ? cardId : null;
	if(activeCard === next) return;
	activeCard = next;
	listeners.forEach(listener => listener());
}
