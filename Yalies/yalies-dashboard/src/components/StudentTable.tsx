import styles from "./studenttable.module.scss";

const COLUMNS = ["name", "netid", "email", "year", "college", "major"] as const;

export default function StudentTable({
	students,
}: {
	students: Record<string, unknown>[];
}) {
	return (
		<div className={styles.wrapper}>
			<table className={styles.table}>
				<thead>
					<tr>
						{COLUMNS.map((col) => (
							<th key={col} className={styles.th}>
								{col.charAt(0).toUpperCase() + col.slice(1)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{students.map((student, i) => (
						<tr key={i} className={i % 2 === 1 ? styles.zebra : undefined}>
							{COLUMNS.map((col) => (
								<td key={col} className={styles.td}>
									{String(student[col] ?? "")}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{students.length === 0 && (
				<p className={styles.empty}>No students to display.</p>
			)}
		</div>
	);
}
