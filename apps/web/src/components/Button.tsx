import styles from "./button.module.scss";

export default function Button({
	children,
	onClick,
	disabled,
	variant,
}: {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	variant?: "primary" | "secondary" | "destructive";
}) {
	const className = `${styles.button} ${variant === "secondary" ? styles.secondary : ""} ${variant === "destructive" ? styles.destructive : ""}`;

	return (
		<button
			className={className}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
