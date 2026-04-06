import type { Metadata } from "next";
import "./globals.scss";
import mainStyle from "./main.module.scss";
import { GoogleAnalytics } from "@next/third-parties/google";

export const metadata: Metadata = {
	title: "Yalies",
	description: "The Yale search engine! ✨",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>
				<div id={mainStyle.content}>
					{children}
				</div>
			</body>
			<GoogleAnalytics gaId="G-4ZXZ59XG92" />
		</html>
	);
}
