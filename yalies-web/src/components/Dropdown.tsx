"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./dropdown.module.scss";
import { faX, faCaretUp } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import Input from "./Input";

export type DropdownOption = {
	label: string;
	value: string;
};

function DropdownChip({
	label,
	onRemove,
}: {
	label: string;
	onRemove: () => void;
}) {
	return (
		<div className={styles.dropdown_chip}>
			{label}
			<FontAwesomeIcon icon={faX} onClick={onRemove} />
		</div>
	);
};

function DropdownOptions({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<div className={styles.dropdown_option} onClick={onClick}>
			{label}
		</div>
	);
}

function DropdownPopup({
	shown,
	label,
	options,
	value,
	onValueChange,
}: {
	shown: boolean;
	label: string;
	options: DropdownOption[];
	value: string[];
	onValueChange: (value: string[]) => void;
}) {
	const [searchText, setSearchText] = useState("");
	const onSearchTextChange = (e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value);
	
	if(!shown) return null;

	const optionsElems = options
		.filter((option) => !value.includes(option.value))
		.filter((option) => option.label.toLowerCase().includes(searchText.toLowerCase()))
		.map((option) => (
			<DropdownOptions
				key={option.value}
				label={option.label}
				onClick={() => {
					onValueChange([...value, option.value]);
					setSearchText("");
				}}
			/>
		));

	const noOptions = optionsElems.length === 0 && (
		<div className={styles.no_options}>
			No options
		</div>
	)
	
	const chips = options
		.filter((option) => value.includes(option.value))
		.map((option) => (
			<DropdownChip
				key={option.value}
				label={option.label}
				onRemove={() => onValueChange(value.filter((v) => v !== option.value))}
			/>
		));

	return (
		<div className={styles.dropdown_popup}>
			<div className={styles.chip_container}>
				{chips}
			</div>
			<Input
				autofocus
				placeholder={label}
				value={searchText}
				onChange={onSearchTextChange}
			/>
			<div className={styles.dropdown_options_container}>
				{optionsElems}
				{noOptions}
			</div>
		</div>
	);
}

export default function Dropdown({
	label,
	options,
	value,
	onValueChange,
}: {
	label: string;
	options: DropdownOption[];
	value: string[];
	onValueChange: (value: string[]) => void;
}) {
	const [dropdownActive, setDropdownActive] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownActive(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const itemsSelected = value.length > 0;
	const icon = itemsSelected ? faX : faCaretUp;

	const textDisplay = useMemo(() => {
		if(value.length === 0) return label;
		const first = options.find((option) => option.value === value[0])?.label;
		if(value.length > 1) {
			const remaining = value.length - 1;
			return `${first} +${remaining}`;
		}
		return first;
	}, [value, options, label]);

	return (
		<div className={styles.dropdown_container} ref={dropdownRef}>
			<button
				className={`
					${styles.dropdown_button}
					${itemsSelected ? styles.selected : ""}
					${dropdownActive ? styles.active : ""}
				`}
				onClick={() => setDropdownActive(!dropdownActive)}
			>
				{textDisplay}
				<FontAwesomeIcon
					icon={icon}
					onClick={() => onValueChange([])}
				/>
			</button>
			<DropdownPopup
				shown={dropdownActive}
				label={label}
				options={options}
				value={value}
				onValueChange={onValueChange}
			/>
		</div>
	);
}
