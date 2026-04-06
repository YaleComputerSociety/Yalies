import styles from "./topbar.module.scss";

export default function Topbar({ children }: { children: React.ReactNode }) {
	return (
		<>
			<div className={styles.announcement}>
				Yalies v3 is here! <a
					href="https://example.com/yalies-v3"
					target="_blank"
					rel="noopener noreferrer"
					className={styles.announcementLink}
				>See what&apos;s new &rarr;</a>
			</div>
			<div id={styles.topbar}>
				{children}
			</div>
		</>
	);
};
