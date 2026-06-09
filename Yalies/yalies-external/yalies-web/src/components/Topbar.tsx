import styles from "./topbar.module.scss";

export default function Topbar({ children }: { children: React.ReactNode }) {
	return (
		<>
			<div className={styles.announcement}>
				Site is under summer maintenance by Y/CS
			</div>
			<div id={styles.topbar}>
				{children}
			</div>
		</>
	);
};
