import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Continue with Yalies",
	description: "Connect your Yalies identity to an approved Yale application.",
	referrer: "no-referrer",
	robots: { index: false, follow: false },
};

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
	return children;
}
