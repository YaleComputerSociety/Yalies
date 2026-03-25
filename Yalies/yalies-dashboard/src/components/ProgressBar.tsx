import styles from "./progressbar.module.scss";

export default function ProgressBar({
	current,
	total,
	label,
}: {
	current: number;
	total: number;
	label?: string;
}) {
	const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

	return (
		<div className={styles.container}>
			{label && <div className={styles.label}>{label}</div>}
			<div className={styles.track}>
				<div
					className={styles.fill}
					style={{ width: `${percentage}%` }}
				/>
			</div>
			<div className={styles.text}>
				{current.toLocaleString()} / {total.toLocaleString()} ({percentage}%)
			</div>
		</div>
	);
}
