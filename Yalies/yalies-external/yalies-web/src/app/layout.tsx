import type { Metadata } from "next";
import "./globals.scss";
import mainStyle from "./main.module.scss";
import { GoogleAnalytics } from "@next/third-parties/google";

export const metadata: Metadata = {
	title: "Yalies",
	description: "The Yale search engine! ✨",
};

const themeScript = `
	try {
		const theme = localStorage.getItem("yalies-theme");
		document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
	} catch {
		document.documentElement.dataset.theme = "light";
	}
`;

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body>
				<div id={mainStyle.content}>
					{children}
				</div>
			</body>
			<GoogleAnalytics gaId="G-4ZXZ59XG92" />
		</html>
	);
}
