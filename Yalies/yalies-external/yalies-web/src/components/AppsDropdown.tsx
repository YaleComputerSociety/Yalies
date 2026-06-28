"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./appsdropdown.module.scss";

type AppLink = {
	name: string;
	href: string;
	color: string;
	image: string;
	imageShift?: "up" | "upMore";
	imageSize?: "large" | "xlarge";
	roundedImage?: boolean;
};

const apps: AppLink[] = [
	{
		name: "CourseTable",
		href: "https://coursetable.com",
		image: "/apps-panel/coursetable.svg",
		color: "#468ff2",
	},
	{
		name: "Yalies",
		href: "https://yalies.io",
		image: "/apps-panel/yalies.png",
		color: "#28639b",
	},
	{
		name: "Yale Clubs",
		href: "https://yaleclubs.io",
		image: "/apps-panel/yclubs.svg",
		color: "#438fd1",
	},
	{
		name: "y/meets",
		href: "https://ymeets.com",
		image: "/apps-panel/ymeetslogo.png",
		roundedImage: true,
		color: "#468ff2",
	},
	{
		name: "Yale IMs",
		href: "https://yaleims.com",
		image: "/apps-panel/yaleims.png",
		imageShift: "up",
		color: "#e2ad16",
	},
	{
		name: "y/labs",
		href: "https://yalelabs.io",
		image: "/apps-panel/ylabs.png",
		imageShift: "up",
		color: "#1678d3",
	},
	{
		name: "Yale Meals",
		href: "https://apps.apple.com/us/app/yalemeals/id6755962674",
		image: "/apps-panel/yale-menus.png",
		imageShift: "upMore",
		imageSize: "xlarge",
		color: "#164b78",
	},
];

function normalizeHostname(hostname: string) {
	return hostname.replace(/^www\./, "");
}

export default function AppsDropdown() {
	const [open, setOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if(wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div className={styles.wrapper} ref={wrapperRef}>
			<button
				type="button"
				className={styles.toggle}
				onClick={() => setOpen(!open)}
				aria-label="Yale apps"
				aria-expanded={open}
			>
				<span className={styles.waffle} aria-hidden>
					{Array.from({ length: 9 }, (_, index) => <span key={index} />)}
				</span>
			</button>
			{open && (
				<div className={styles.dropdown}>
					<div className={styles.app_grid}>
						{apps.map((app) => (
							<a
								key={app.name}
								className={styles.app_tile}
								href={app.href}
								target="_blank"
								rel="noopener noreferrer"
								onClick={(event) => {
									const targetUrl = new URL(app.href);
									if(normalizeHostname(window.location.hostname) === normalizeHostname(targetUrl.hostname)) {
										event.preventDefault();
										setOpen(false);
										window.location.assign(targetUrl.origin);
										return;
									}
									setOpen(false);
								}}
							>
								<span className={styles.app_icon} style={{ color: app.color }}>
									<img
										src={app.image}
										alt=""
										className={[
											app.imageShift === "upMore" ? styles.app_icon_img_up_more : undefined,
											app.imageShift === "up" ? styles.app_icon_img_up : undefined,
											app.imageSize === "xlarge" ? styles.app_icon_img_xlarge : undefined,
											app.imageSize === "large" ? styles.app_icon_img_large : undefined,
											app.roundedImage ? styles.app_icon_img_rounded : undefined,
										].filter(Boolean).join(" ") || undefined}
									/>
								</span>
								<span>{app.name}</span>
							</a>
						))}
					</div>
					<p className={styles.attribution}>
						Yalies is a{" "}
						<a href="https://yalecomputersociety.org" target="_blank" rel="noopener noreferrer">
							y/cs
						</a>{" "}
						product
					</p>
				</div>
			)}
		</div>
	);
}
