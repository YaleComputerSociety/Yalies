"use client";

import { useState } from "react";
import { DISCOVERY_FIELDS, DISCOVERY_OPTIONS, DISCOVERY_OPTION_LABELS, type DiscoveryField, type DiscoveryProfile } from "yalies-shared";
import styles from "@/app/profile/profile.module.scss";

export const DISCOVERY_INTRO = "Select what you identify as. Information never appears on your profile. Profile information is viewed only in aggregate, and we never expose your identity as a searcher. See our open-source code on how we use this context.";

export function discoveryChoiceUpdate(profile: DiscoveryProfile, field: DiscoveryField, value: string) {
	if(field !== "race") return profile[field] === value && !profile.skipped?.includes(field) ? null : { [field]: value };
	return { race: profile.race?.includes(value as never) ? profile.race.filter(item => item !== value) : [...(profile.race ?? []), value] };
}

export default function DiscoveryOptions({ profile, disabled, onSelect, onSkip }: {
	profile: DiscoveryProfile | null;
	disabled: boolean;
	onSelect: (field: DiscoveryField, value: string) => void;
	onSkip: (field: DiscoveryField) => void;
}) {
	const [expanded, setExpanded] = useState<Partial<Record<DiscoveryField, boolean>>>({});
	return <>{DISCOVERY_FIELDS.map(field => <fieldset key={field} className={styles.discovery_field} disabled={disabled}>
		<legend>{DISCOVERY_OPTIONS[field].label} {profile?.skipped?.includes(field) && !expanded[field]
			? <button type="button" className={styles.discovery_show} onClick={() => setExpanded(current => ({ ...current, [field]: true }))}>Show</button>
			: <button type="button" className={styles.discovery_skip} onClick={() => { setExpanded(current => ({ ...current, [field]: false })); onSkip(field); }}>Skip</button>}</legend>
		{(!profile?.skipped?.includes(field) || expanded[field]) && <div className={styles.discovery_options}>
			{(field === "race" && profile?.race?.includes("Asian") ? [...DISCOVERY_OPTIONS[field].options.slice(0, -1), "Asian", "Other"] : DISCOVERY_OPTIONS[field].options).map(option => <button key={option} type="button"
				aria-pressed={field === "race" ? profile?.race?.includes(option as never) ?? false : profile?.[field] === option}
				title={DISCOVERY_OPTION_LABELS[option] ? option : undefined}
				onClick={() => onSelect(field, option)}>{DISCOVERY_OPTION_LABELS[option] ?? option}</button>)}
		</div>}
	</fieldset>)}</>;
}
