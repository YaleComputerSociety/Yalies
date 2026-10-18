"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";

export default function RouteAnalytics() {
	const pathname = usePathname();
	// Authentication interactions and their URLs must stay out of analytics.
	if(pathname === "/connect") return null;
	return <GoogleAnalytics gaId="G-4ZXZ59XG92" />;
}
