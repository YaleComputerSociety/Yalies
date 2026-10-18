import styles from "./input.module.scss";

export default function TextArea({
	placeholder,
	value,
	onChange,
	rows,
	disabled,
}: {
	placeholder?: string;
	value?: string;
	onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
	rows?: number;
	disabled?: boolean;
}) {
	return (
		<textarea
			disabled={disabled}
			className={`${styles.input} ${styles.textarea} ${disabled ? styles.disabled : ""}`}
			placeholder={placeholder}
			value={value}
			onChange={onChange}
			rows={rows || 4}
		/>
	);
}
