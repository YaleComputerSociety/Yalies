"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import styles from "./themetoggle.module.scss";

type Theme = "light" | "dark";

const getPreferredTheme = (): Theme => {
	if (typeof window === "undefined") return "light";
	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark") return stored;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		const preferredTheme = getPreferredTheme();
		setTheme(preferredTheme);
		document.documentElement.dataset.theme = preferredTheme;
	}, []);

	const toggleTheme = () => {
		const nextTheme = theme === "dark" ? "light" : "dark";
		setTheme(nextTheme);
		document.documentElement.dataset.theme = nextTheme;
		window.localStorage.setItem("theme", nextTheme);
	};

	const label = `To ${theme === "dark" ? "light" : "dark"} mode`;

	return (
		<button
			type="button"
			className={styles.button}
			onClick={toggleTheme}
			title={label}
			aria-label={label}
		>
			<FontAwesomeIcon icon={theme === "dark" ? faMoon : faSun} />
		</button>
	);
}
