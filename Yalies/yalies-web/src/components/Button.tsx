import styles from "./button.module.scss";

export default function Button({
	children,
	onClick,
}: {
	children: React.ReactNode,
	onClick?: () => void,
}) {
	return (
		<button
			className={styles.button}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
