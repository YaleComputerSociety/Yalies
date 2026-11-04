"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./dropdown.module.scss";
import { faX, faCaretUp, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import Input from "./Input";

export type DropdownOption = {
	label: string;
	value: string;
	// Shown on chips and the button when the label alone is ambiguous (e.g. day "14" -> "Feb 14")
	chipLabel?: string;
};

// A nested list shown when hovering its parent option (e.g. states under United States)
export type DropdownSubMenu = {
	label: string;
	options: DropdownOption[];
	layout?: "list" | "grid";
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
	onMouseEnter,
	hasSubMenu,
	subMenuOpen,
	onToggleSubMenu,
	className,
}: {
	label: string;
	onClick: () => void;
	onMouseEnter?: () => void;
	hasSubMenu?: boolean;
	subMenuOpen?: boolean;
	onToggleSubMenu?: () => void;
	className?: string;
}) {
	return (
		<div
			className={`${styles.dropdown_option} ${hasSubMenu ? styles.has_submenu : ""} ${subMenuOpen ? styles.submenu_open : ""} ${className ?? ""}`}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
		>
			{label}
			{hasSubMenu && (
				<FontAwesomeIcon
					icon={faCaretRight}
					className={styles.submenu_arrow}
					onClick={(e) => {
						// Tapping the arrow opens the submenu without selecting the parent (touch screens have no hover)
						e.stopPropagation();
						onToggleSubMenu?.();
					}}
				/>
			)}
		</div>
	);
}

function DropdownSubMenuPopup({
	subMenu,
	value,
	onValueChange,
}: {
	subMenu: DropdownSubMenu;
	value: string[];
	onValueChange: (value: string[]) => void;
}) {
	const [searchText, setSearchText] = useState("");
	const onSearchTextChange = (e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value);
	const isGrid = subMenu.layout === "grid";

	const optionsElems = subMenu.options
		.filter((option) => isGrid || !value.includes(option.value))
		.filter((option) => option.label.toLowerCase().includes(searchText.toLowerCase()))
		.map((option) => {
			const selected = value.includes(option.value);
			return (
				<DropdownOptions
					key={option.value}
					label={option.label}
					className={isGrid && selected ? styles.grid_selected : ""}
					onClick={() => {
						// Grid cells stay visible, so clicking a selected one deselects it
						onValueChange(selected ? value.filter((v) => v !== option.value) : [...value, option.value]);
						setSearchText("");
					}}
				/>
			);
		});

	const noOptions = optionsElems.length === 0 && (
		<div className={styles.no_options}>
			No options
		</div>
	)

	return (
		<div className={styles.dropdown_submenu}>
			{isGrid ? (
				<div className={styles.submenu_title}>{subMenu.label}</div>
			) : (
				<Input
					placeholder={subMenu.label}
					value={searchText}
					onChange={onSearchTextChange}
				/>
			)}
			<div className={`${styles.dropdown_options_container} ${isGrid ? styles.options_grid : ""}`}>
				{optionsElems}
				{noOptions}
			</div>
		</div>
	);
}

function DropdownPopup({
	shown,
	label,
	options,
	value,
	onValueChange,
	subMenus,
	subValue,
	onSubValueChange,
}: {
	shown: boolean;
	label: string;
	options: DropdownOption[];
	value: string[];
	onValueChange: (value: string[]) => void;
	subMenus?: Record<string, DropdownSubMenu>;
	subValue: string[];
	onSubValueChange: (value: string[]) => void;
}) {
	const [searchText, setSearchText] = useState("");
	const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
	const onSearchTextChange = (e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value);

	useEffect(() => {
		if(!shown) setOpenSubMenu(null);
	}, [shown]);

	if(!shown) return null;

	const optionsElems = options
		.filter((option) => !value.includes(option.value))
		.filter((option) => option.label.toLowerCase().includes(searchText.toLowerCase()))
		.map((option) => {
			const hasSubMenu = !!subMenus?.[option.value];
			return (
				<DropdownOptions
					key={option.value}
					label={option.label}
					onClick={() => {
						onValueChange([...value, option.value]);
						setSearchText("");
					}}
					onMouseEnter={() => setOpenSubMenu(hasSubMenu ? option.value : null)}
					hasSubMenu={hasSubMenu}
					subMenuOpen={openSubMenu === option.value}
					onToggleSubMenu={() => setOpenSubMenu(openSubMenu === option.value ? null : option.value)}
				/>
			);
		});

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
				label={option.chipLabel ?? option.label}
				onRemove={() => onValueChange(value.filter((v) => v !== option.value))}
			/>
		));

	const subOptions = Object.values(subMenus ?? {}).flatMap((subMenu) => subMenu.options);
	const subMenuChips = subOptions
		.filter((option) => subValue.includes(option.value))
		.map((option) => (
			<DropdownChip
				key={`sub-${option.value}`}
				label={option.chipLabel ?? option.label}
				onRemove={() => onSubValueChange(subValue.filter((v) => v !== option.value))}
			/>
		));

	const activeSubMenu = openSubMenu ? subMenus?.[openSubMenu] : undefined;

	return (
		<div className={styles.dropdown_popup} onMouseLeave={() => setOpenSubMenu(null)}>
			<div className={styles.chip_container}>
				{chips}
				{subMenuChips}
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
			{activeSubMenu && (
				<DropdownSubMenuPopup
					key={openSubMenu}
					subMenu={activeSubMenu}
					value={subValue}
					onValueChange={onSubValueChange}
				/>
			)}
		</div>
	);
}

export default function Dropdown({
	label,
	options,
	value,
	onValueChange,
	subMenus,
	subValue,
	onSubValueChange,
}: {
	label: string;
	options: DropdownOption[];
	value: string[];
	onValueChange: (value: string[]) => void;
	// Keyed by parent option value; all submenus share subValue
	subMenus?: Record<string, DropdownSubMenu>;
	subValue?: string[];
	onSubValueChange?: (value: string[]) => void;
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

	const selectedSubValue = useMemo(() => subValue ?? [], [subValue]);
	const itemsSelected = value.length > 0 || selectedSubValue.length > 0;
	const icon = itemsSelected ? faX : faCaretUp;

	const textDisplay = useMemo(() => {
		const subOptions = Object.values(subMenus ?? {}).flatMap((subMenu) => subMenu.options);
		const labelFor = (opts: DropdownOption[], v: string) => {
			const option = opts.find((o) => o.value === v);
			return option ? option.chipLabel ?? option.label : v;
		};
		const selectedLabels = [
			...value.map((v) => labelFor(options, v)),
			...selectedSubValue.map((v) => labelFor(subOptions, v)),
		];
		if(selectedLabels.length === 0) return label;
		if(selectedLabels.length > 1) {
			const remaining = selectedLabels.length - 1;
			return `${selectedLabels[0]} +${remaining}`;
		}
		return selectedLabels[0];
	}, [value, options, label, subMenus, selectedSubValue]);

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
					onClick={() => {
						onValueChange([]);
						onSubValueChange?.([]);
					}}
				/>
			</button>
			<DropdownPopup
				shown={dropdownActive}
				label={label}
				options={options}
				value={value}
				onValueChange={onValueChange}
				subMenus={subMenus}
				subValue={selectedSubValue}
				onSubValueChange={onSubValueChange ?? (() => {})}
			/>
		</div>
	);
}
