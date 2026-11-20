import type { Metadata } from "next";
import "./globals.scss";
import mainStyle from "./main.module.scss";
import RouteAnalytics from "../components/RouteAnalytics";
import NavigationShell from "../components/NavigationShell";

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
					<NavigationShell>{children}</NavigationShell>
				</div>
			</body>
			{process.env.YALIES_PREVIEW !== "true" && <RouteAnalytics />}
		</html>
	);
}
