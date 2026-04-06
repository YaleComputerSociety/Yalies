import type { StepStatus } from "@/lib/types";
import styles from "./statusbadge.module.scss";

export default function StatusBadge({ status }: { status: StepStatus }) {
	const labels: Record<StepStatus, string> = {
		pending: "Pending",
		active: "Active",
		running: "Running",
		done: "Done",
		error: "Error",
	};

	return (
		<span className={`${styles.badge} ${styles[status]}`}>
			{labels[status]}
		</span>
	);
}
