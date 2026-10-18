import type { StepStatus } from "@/lib/types";
import styles from "./stepindicator.module.scss";

export default function StepIndicator({
	steps,
	currentStep,
}: {
	steps: { label: string; status: StepStatus }[];
	currentStep: number;
}) {
	return (
		<div className={styles.container}>
			{steps.map((step, i) => (
				<div key={i} className={styles.stepWrapper}>
					{i > 0 && (
						<div
							className={`${styles.line} ${
								steps[i - 1].status === "done" ? styles.lineDone : ""
							}`}
						/>
					)}
					<div
						className={`${styles.circle} ${styles[step.status]} ${
							i === currentStep ? styles.current : ""
						}`}
					>
						{step.status === "done" ? (
							<span>&#10003;</span>
						) : (
							<span>{i + 1}</span>
						)}
					</div>
					<span
						className={`${styles.label} ${
							i === currentStep ? styles.labelCurrent : ""
						}`}
					>
						{step.label}
					</span>
				</div>
			))}
		</div>
	);
}
