import styles from "./statscard.module.scss";

export default function StatsCard({
	title,
	stats,
}: {
	title: string;
	stats: Record<string, string | number>;
}) {
	return (
		<div className={styles.card}>
			<h3 className={styles.title}>{title}</h3>
			<div className={styles.grid}>
				{Object.entries(stats).map(([key, value]) => (
					<div key={key} className={styles.stat}>
						<span className={styles.statLabel}>{key}</span>
						<span className={styles.statValue}>{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}
