"use client";

import { ComponentProps, useSyncExternalStore } from "react";
import { markYaleMojiVisit } from "@/hooks/yalemojiCache";

function subscribeToTheme(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
	return () => observer.disconnect();
}

function getTheme() {
	return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerTheme() {
	return "light";
}

export default function YaleMojiLink({ href, children, onClick, onAuxClick, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
	const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
	const url = new URL(href);
	url.searchParams.set("mode", theme);
	return <a {...props} href={url.toString()} onClick={(event) => {
		onClick?.(event);
		if(!event.defaultPrevented) markYaleMojiVisit();
	}} onAuxClick={(event) => {
		onAuxClick?.(event);
		if(event.button === 1 && !event.defaultPrevented) markYaleMojiVisit();
	}}>{children}</a>;
}
