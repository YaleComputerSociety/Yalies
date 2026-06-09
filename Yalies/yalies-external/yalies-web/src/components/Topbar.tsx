import styles from "./topbar.module.scss";

export default function Topbar({ children }: { children: React.ReactNode }) {
	return (
		<>
			<div className={styles.announcement}>
				🚧 Yalies is currently down for summer maintenance by Y/CS. Expect things to be broken.
			</div>
			<div id={styles.topbar}>
				{children}
			</div>
		</>
	);
};
