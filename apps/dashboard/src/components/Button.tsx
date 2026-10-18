"use client";

import styles from "./button.module.scss";

export default function Button({
	children,
	variant = "primary",
	onClick,
	disabled = false,
	loading = false,
}: {
	children: React.ReactNode;
	variant?: "primary" | "secondary" | "destructive" | "ghost";
	onClick?: () => void;
	disabled?: boolean;
	loading?: boolean;
}) {
	return (
		<button
			className={`${styles.button} ${styles[variant]}`}
			onClick={onClick}
			disabled={disabled || loading}
		>
			{loading && <span className={styles.spinner} />}
			{children}
		</button>
	);
}
