import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

// Render menus outside cards and size them against the actual browser viewport.
export function usePopoverPosition(open: boolean, trigger: RefObject<HTMLElement>, menu: RefObject<HTMLElement>, width: number) {
	const [position, setPosition] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });
	useLayoutEffect(() => {
		if(!open) return;
		const update = () => {
			if(!trigger.current || !menu.current) return;
			const rect = trigger.current.getBoundingClientRect();
			const viewport = window.visualViewport;
			const height = viewport?.height ?? window.innerHeight;
			const viewportWidth = viewport?.width ?? window.innerWidth;
			const offsetTop = viewport?.offsetTop ?? 0;
			const offsetLeft = viewport?.offsetLeft ?? 0;
			const margin = 12;
			const gap = 6;
			const menuWidth = Math.min(width, viewportWidth - margin * 2);
			const below = offsetTop + height - rect.bottom - gap - margin;
			const above = rect.top - offsetTop - gap - margin;
			const naturalHeight = menu.current.scrollHeight + 2;
			const showAbove = below < Math.min(naturalHeight, 400) && above > below;
			const maxHeight = Math.max(0, Math.min(400, showAbove ? above : below));
			setPosition({
				position: "fixed", visibility: "visible", width: menuWidth, maxHeight,
				left: Math.max(offsetLeft + margin, Math.min(rect.right - menuWidth, offsetLeft + viewportWidth - menuWidth - margin)),
				top: showAbove ? rect.top - gap - Math.min(naturalHeight, maxHeight) : rect.bottom + gap,
			});
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		const observer = new ResizeObserver(update);
		if(menu.current) observer.observe(menu.current);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
			observer.disconnect();
		};
	}, [open, trigger, menu, width]);
	return position;
}
