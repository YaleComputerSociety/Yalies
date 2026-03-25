import type { ValidationResult } from "@/lib/types";
import styles from "./validationresults.module.scss";

export default function ValidationResults({
	result,
}: {
	result: ValidationResult;
}) {
	return (
		<div className={styles.container}>
			{result.passes.length > 0 && (
				<ul className={styles.list}>
					{result.passes.map((msg, i) => (
						<li key={`pass-${i}`} className={styles.pass}>
							<span className={styles.icon}>&#10003;</span>
							{msg}
						</li>
					))}
				</ul>
			)}
			{result.warnings.length > 0 && (
				<ul className={styles.list}>
					{result.warnings.map((msg, i) => (
						<li key={`warn-${i}`} className={styles.warning}>
							<span className={styles.icon}>&#9888;</span>
							{msg}
						</li>
					))}
				</ul>
			)}
			{result.failures.length > 0 && (
				<ul className={styles.list}>
					{result.failures.map((msg, i) => (
						<li key={`fail-${i}`} className={styles.failure}>
							<span className={styles.icon}>&#10007;</span>
							{msg}
						</li>
					))}
				</ul>
			)}
			{result.passes.length === 0 && result.warnings.length === 0 && result.failures.length === 0 && (
				<p className={styles.empty}>No validation results.</p>
			)}
		</div>
	);
}
