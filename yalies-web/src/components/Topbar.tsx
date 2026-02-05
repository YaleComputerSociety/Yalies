
import styles from "./topbar.module.scss";

export default function Topbar({ children }: { children: React.ReactNode }) {
	return (
		<div id={styles.topbar}>
			{children}
		</div>
	);
};
