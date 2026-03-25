import styles from "./input.module.scss";

export default function Input({
	placeholder,
	value,
	onChange,
	autofocus,
	onSubmit,
	disabled,
}: {
	placeholder?: string;
	value?: string;
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
	autofocus?: boolean;
	onSubmit?: () => void;
	disabled?: boolean;
}) {
	const onKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if(e.key === "Enter") onSubmit && onSubmit();
	};

	return (
		<input
			disabled={disabled}
			className={`${styles.input} ${disabled ? styles.disabled : ""}`}
			placeholder={placeholder}
			value={value}
			onChange={onChange}
			autoFocus={autofocus}
			onKeyUp={onKeyUp}
		/>
	);
};
