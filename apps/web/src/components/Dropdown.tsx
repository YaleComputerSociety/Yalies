"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faX, faCaretUp, faCaretRight, faArrowLeft, faCheck, faCircleMinus, faCirclePlus } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFilterPopoverLayout } from "@/helpers/filterPopover";
import styles from "./dropdown.module.scss";

export type DropdownOption = {
	label: string;
	value: string;
	chipLabel?: string;
};

// Nested choices use the same panel for mouse, touch, and keyboard.
export type DropdownSubMenu = {
	label: string;
	allLabel: string;
	options: DropdownOption[];
	layout?: "list" | "grid";
};

type DropdownProps = {
	label: string;
	options: DropdownOption[];
	value: string[];
	onValueChange: (value: string[]) => void;
	excludedValue?: string[];
	onExcludeToggle?: (value: string) => void;
	onClear?: () => void;
	subMenus?: Record<string, DropdownSubMenu>;
	subValue?: string[];
	onSubValueChange?: (value: string[]) => void;
	excludedSubValue?: string[];
	onSubExcludeToggle?: (value: string) => void;
	onClearSubMenu?: (value: string) => void;
	onSubMenuExcludeToggle?: (value: string) => void;
};

function ExclusionToggle({ label, excluded, onClick }: { label: string; excluded: boolean; onClick: () => void }) {
	const action = `${excluded ? "Include" : "Exclude"} ${label}`;
	return <button type="button" className={styles.exclusion_toggle} aria-label={action} title={action} aria-pressed={excluded} onClick={onClick}>
		<FontAwesomeIcon icon={excluded ? faCirclePlus : faCircleMinus} />
	</button>;
}

function SelectionButton({ option, selected, onClick, grid = false, excluded = false, onExcludeToggle }: {
	option: DropdownOption;
	selected: boolean;
	onClick: () => void;
	grid?: boolean;
	excluded?: boolean;
	onExcludeToggle?: () => void;
}) {
	const choice = (
		<button type="button"
			className={`${styles.dropdown_option} ${selected ? styles.option_selected : ""} ${excluded ? styles.option_excluded : ""} ${grid ? styles.day_option : ""}`}
			aria-label={`${excluded ? "Excluded: " : ""}${option.chipLabel ?? option.label}`} aria-pressed={selected} onClick={onClick}
		>
			{!grid && <span className={styles.selection_mark} aria-hidden="true">{selected && <FontAwesomeIcon icon={faCheck} />}</span>}
			{option.label}
		</button>
	);
	if (!onExcludeToggle) return choice;
	return <div className={`${styles.option_row} ${selected ? styles.option_selected : ""} ${excluded ? styles.option_excluded : ""}`}>
		{choice}{selected && <ExclusionToggle label={option.label} excluded={excluded} onClick={onExcludeToggle} />}
	</div>;
}

function DropdownPopup({ label, options, value, onValueChange, subMenus, subValue = [], onSubValueChange,
	excludedValue = [], onExcludeToggle, excludedSubValue = [], onSubExcludeToggle, onClearSubMenu, onSubMenuExcludeToggle,
	anchor, onClose, id,
}: DropdownProps & { anchor: HTMLButtonElement; onClose: () => void; id: string }) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const restoreFocusRef = useRef(true);
	const [searchText, setSearchText] = useState("");
	const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
	const activeSubMenu = openSubMenu ? subMenus?.[openSubMenu] : undefined;
	const isGrid = activeSubMenu?.layout === "grid";
	const isMonthPicker = !activeSubMenu && options.length > 0 && options.every(option => subMenus?.[option.value]?.layout === "grid");
	const activeOptions = activeSubMenu?.options ?? options;
	const activeValues = activeSubMenu ? subValue : value;
	const activeExcludedValues = activeSubMenu ? excludedSubValue : excludedValue;
	const activeExcludeToggle = activeSubMenu ? onSubExcludeToggle : onExcludeToggle;
	const filteredOptions = activeOptions.filter(option => option.label.toLowerCase().includes(searchText.toLowerCase()));

	useEffect(() => {
		if (bodyRef.current) bodyRef.current.scrollTop = 0;
		headingRef.current?.focus({ preventScroll: true });
	}, [openSubMenu]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const viewport = window.visualViewport;
		const previousOverflow = document.body.style.overflow;
		const previousPadding = document.body.style.paddingRight;
		let sheetMode: boolean | undefined;
		const position = () => {
			const layout = getFilterPopoverLayout(anchor.getBoundingClientRect(), {
				left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
				width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
			});
			dialog.dataset.sheet = String(layout.sheet);
			dialog.dataset.short = String(layout.height < 360);
			Object.assign(dialog.style, {
				left: `${layout.left}px`, top: `${layout.top}px`, width: `${layout.width}px`,
				height: "auto", maxHeight: `${layout.height}px`, transform: layout.above ? "translateY(-100%)" : "none",
			});
			if (sheetMode !== layout.sheet) {
				if (dialog.open) dialog.close();
				if (layout.sheet) {
					dialog.showModal();
					const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
					if (scrollbarWidth > 0) document.body.style.paddingRight = `${parseFloat(window.getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
					document.body.style.overflow = "hidden";
				} else {
					dialog.show();
					document.body.style.overflow = previousOverflow;
					document.body.style.paddingRight = previousPadding;
				}
				sheetMode = layout.sheet;
			}
		};
		position();
		// Touch users can browse without immediately summoning the keyboard.
		if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) searchRef.current?.focus({ preventScroll: true });
		else headingRef.current?.focus({ preventScroll: true });
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, true);
		viewport?.addEventListener("resize", position);
		viewport?.addEventListener("scroll", position);
		return () => {
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position, true);
			viewport?.removeEventListener("resize", position);
			viewport?.removeEventListener("scroll", position);
			document.body.style.overflow = previousOverflow;
			document.body.style.paddingRight = previousPadding;
			dialog.close();
			if (restoreFocusRef.current) anchor.focus({ preventScroll: true });
		};
	}, [anchor]);

	useEffect(() => {
		const dismissOutside = (event: Event) => {
			if (dialogRef.current?.dataset.sheet === "true") return;
			const target = event.target as Node;
			if (!dialogRef.current?.contains(target) && !anchor.contains(target)) {
				restoreFocusRef.current = false;
				onClose();
			}
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || dialogRef.current?.dataset.sheet === "true") return;
			event.preventDefault();
			if (openSubMenu) {
				setOpenSubMenu(null);
				setSearchText("");
			} else onClose();
		};
		document.addEventListener("pointerdown", dismissOutside);
		document.addEventListener("focusin", dismissOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", dismissOutside);
			document.removeEventListener("focusin", dismissOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [anchor, onClose, openSubMenu]);

	const navigate = (parent: string | null) => {
		setOpenSubMenu(parent);
		setSearchText("");
	};
	const toggleOption = (option: DropdownOption) => {
		const next = activeValues.includes(option.value)
			? activeValues.filter(item => item !== option.value) : [...activeValues, option.value];
		if (activeSubMenu) onSubValueChange?.(next);
		else onValueChange(next);
	};

	return createPortal(
		<dialog id={id} ref={dialogRef} className={styles.dropdown_popup}
			aria-labelledby={`${id}-title`}
			onClose={event => { if (!event.currentTarget.open) onClose(); }}
			onCancel={event => {
				event.preventDefault();
				if (activeSubMenu) navigate(null);
				else onClose();
			}}
			onClick={event => {
				if (event.target !== event.currentTarget) return;
				const bounds = event.currentTarget.getBoundingClientRect();
				if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
			}}
		>
			<div className={styles.popup_header} data-nested={!!activeSubMenu}>
				{activeSubMenu && <button type="button" className={styles.icon_button} onClick={() => navigate(null)} aria-label={`Back to ${label.toLowerCase()} options`}><FontAwesomeIcon icon={faArrowLeft} /></button>}
				<h3 id={`${id}-title`} ref={headingRef} tabIndex={-1}>{activeSubMenu?.label ?? label}</h3>
			</div>
			<div className={styles.popup_body} ref={bodyRef}>
				{!isGrid && <div className={styles.search_container}>
					<input ref={searchRef} type="search" className={styles.search_input} placeholder={`Search ${activeSubMenu ? "states" : label === "Birthday" ? "months" : label === "Location" ? "countries" : label.toLowerCase()}`} aria-label={`Search ${activeSubMenu?.label ?? label} options`} value={searchText} onChange={event => setSearchText(event.target.value)} />
				</div>}
				{activeSubMenu && openSubMenu && <div className={styles.all_option}>
					<SelectionButton option={{ label: activeSubMenu.allLabel, value: openSubMenu }} selected={value.includes(openSubMenu)} excluded={excludedValue.includes(openSubMenu)} onExcludeToggle={onExcludeToggle ? () => onExcludeToggle(openSubMenu) : undefined} onClick={() => onValueChange(value.includes(openSubMenu) ? value.filter(item => item !== openSubMenu) : [...value, openSubMenu])} />
				</div>}
				<div className={isGrid ? styles.options_grid : isMonthPicker ? styles.months_grid : styles.options_list}>
					{filteredOptions.map(option => {
						const submenu = !activeSubMenu ? subMenus?.[option.value] : undefined;
						if (submenu) {
							const selectedCount = submenu.options.filter(item => subValue.includes(item.value)).length;
							const branchSelected = value.includes(option.value) || selectedCount > 0;
							const branchExcluded = excludedValue.includes(option.value) || (!value.includes(option.value) && selectedCount > 0 && submenu.options.filter(item => subValue.includes(item.value)).every(item => excludedSubValue.includes(item.value)));
							if (!isMonthPicker) return (
								<div key={option.value} className={`${styles.drilldown_row} ${branchSelected ? styles.option_selected : ""} ${branchExcluded ? styles.option_excluded : ""}`}>
									<button type="button" className={styles.branch_selection} aria-pressed={branchSelected}
										aria-label={branchSelected ? `Clear ${option.label} and state filters` : `Choose ${option.label} or states`}
										onClick={() => {
											if (!branchSelected) { navigate(option.value); return; }
											if (onClearSubMenu) { onClearSubMenu(option.value); return; }
											onValueChange(value.filter(item => item !== option.value));
											onSubValueChange?.(subValue.filter(item => !submenu.options.some(child => child.value === item)));
										}}
									>
										<span className={styles.selection_mark} aria-hidden="true">{branchSelected && <FontAwesomeIcon icon={faCheck} />}</span>
									</button>
									<button type="button" className={styles.dropdown_option} onClick={() => navigate(option.value)} aria-label={`${option.label}: choose states or whole country`}>
										<span>{option.label}</span><span className={styles.drilldown_meta}><FontAwesomeIcon icon={faCaretRight} /></span>
									</button>
									{branchSelected && onExcludeToggle && <ExclusionToggle label={option.label} excluded={branchExcluded} onClick={() => (onSubMenuExcludeToggle ?? onExcludeToggle)(option.value)} />}
								</div>
							);
							return <button type="button" key={option.value} className={styles.dropdown_option} onClick={() => navigate(option.value)} aria-label={`${option.label}: choose ${submenu.layout === "grid" ? "days or whole month" : "states or whole country"}`}>
								<span>{option.label}</span>
								{branchSelected && <span className={styles.drilldown_meta} aria-label={value.includes(option.value) ? "Whole month selected" : `${selectedCount} days selected`}><FontAwesomeIcon icon={faCheck} /></span>}
							</button>;
						}
						return <SelectionButton key={option.value} option={option} selected={activeValues.includes(option.value)} excluded={activeExcludedValues.includes(option.value)} onExcludeToggle={activeExcludeToggle ? () => activeExcludeToggle(option.value) : undefined} grid={isGrid} onClick={() => toggleOption(option)} />;
					})}
					{filteredOptions.length === 0 && <p className={styles.no_options}>No matching options</p>}
				</div>
			</div>
		</dialog>, document.body
	);
}

export default function Dropdown(props: DropdownProps) {
	const { label, options, value, onValueChange, onClear, subMenus, subValue = [], onSubValueChange, excludedValue = [], excludedSubValue = [] } = props;
	const [dropdownActive, setDropdownActive] = useState(false);
	const closeDropdown = useCallback(() => setDropdownActive(false), []);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const id = useId();
	const itemsSelected = value.length > 0 || subValue.length > 0;
	const allExcluded = itemsSelected && value.every(item => excludedValue.includes(item)) && subValue.every(item => excludedSubValue.includes(item));
	const textDisplay = useMemo(() => {
		const subOptions = Object.values(subMenus ?? {}).flatMap(menu => menu.options);
		const labelFor = (opts: DropdownOption[], selected: string) => {
			const option = opts.find(item => item.value === selected);
			return option?.chipLabel ?? option?.label ?? selected;
		};
		const labels = [...value.map(item => `${excludedValue.includes(item) ? "Not " : ""}${labelFor(options, item)}`), ...subValue.map(item => `${excludedSubValue.includes(item) ? "Not " : ""}${labelFor(subOptions, item)}`)];
		if (!labels.length) return label;
		return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0];
	}, [label, options, value, subMenus, subValue, excludedValue, excludedSubValue]);

	return (
		<div className={styles.dropdown_container}>
			<div className={`${styles.dropdown_button} ${itemsSelected ? styles.selected : ""} ${allExcluded ? styles.excluded : ""} ${dropdownActive ? styles.active : ""}`}>
				<button ref={triggerRef} type="button" className={styles.dropdown_toggle} onClick={() => setDropdownActive(open => !open)} aria-label={`${label}: ${textDisplay}`} aria-haspopup="dialog" aria-expanded={dropdownActive} aria-controls={dropdownActive ? id : undefined}>
					{textDisplay}{!itemsSelected && <FontAwesomeIcon icon={faCaretUp} />}
				</button>
				{itemsSelected && <button type="button" className={styles.clear_filter} aria-label={`Clear ${label} filter`} onClick={() => {
					if (onClear) onClear();
					else { onValueChange([]); onSubValueChange?.([]); }
				}}><FontAwesomeIcon icon={faX} /></button>}
			</div>
			{dropdownActive && triggerRef.current && <DropdownPopup {...props} anchor={triggerRef.current} id={id} onClose={closeDropdown} />}
		</div>
	);
}
