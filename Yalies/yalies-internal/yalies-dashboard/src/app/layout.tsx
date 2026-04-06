import type { Metadata } from "next";
import "./globals.scss";
import mainStyle from "./main.module.scss";
import ClientLayout from "../components/ClientLayout";

export const metadata: Metadata = {
	title: "Yalies Dashboard",
	description: "Admin dashboard for the Yalies scraping pipeline",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>
				<ClientLayout>{children}</ClientLayout>
			</body>
		</html>
	);
}
