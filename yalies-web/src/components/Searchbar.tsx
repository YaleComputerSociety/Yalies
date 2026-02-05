import Input from "./Input";
import styles from "./searchbar.module.scss";

export default function Searchbar({
	value,
	onChange,
	onSubmit,
}: {
	value: string;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onSubmit: () => void;
}) {
	return (
		<div id={styles.search_wrapper}>
			<Input
				placeholder="Search Yalies"
				value={value}
				onChange={onChange}
				onSubmit={onSubmit}
			/>
		</div>
	)
};
