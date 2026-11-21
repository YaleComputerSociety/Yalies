// Private, self-reported choices. These are never part of a directory Person.
export const DISCOVERY_OPTIONS = {
	gender: {
		label: "Gender",
		options: ["Female", "Male", "Nonbinary", "Other"],
	},
	sexuality: {
		label: "Sexuality",
		options: ["Straight", "Gay", "Lesbian", "Bi", "Other"],
	},
	religion: {
		label: "Religious adherence",
		options: ["Christian", "Jewish", "Muslim", "None", "Other"],
	},
	race: {
		label: "Racial demographics",
		options: ["White", "East Asian", "South Asian", "Other Asian", "Black", "Latino", "Middle Eastern or North African", "Other"],
	},
} as const;

export const DISCOVERY_OPTION_LABELS: Readonly<Record<string, string>> = {
	"East Asian": "E. Asian",
	"South Asian": "S. Asian",
	"Other Asian": "O. Asian",
	"Middle Eastern or North African": "MENA",
};

// Retain the previous broad answer without guessing a subgroup.
export const DISCOVERY_RACE_VALUES = [...DISCOVERY_OPTIONS.race.options, "Asian"] as const;

export type DiscoveryField = keyof typeof DISCOVERY_OPTIONS;
export type DiscoveryProfile = Partial<{ [K in DiscoveryField]: K extends "race" ? (typeof DISCOVERY_RACE_VALUES[number])[] : typeof DISCOVERY_OPTIONS[K]["options"][number] }> & { skipped?: DiscoveryField[] };
export const DISCOVERY_FIELDS = Object.keys(DISCOVERY_OPTIONS) as DiscoveryField[];
export const DISCOVERY_REQUIRED_FIELDS = 2;

export function discoveryFieldsCompleted(profile: DiscoveryProfile | null | undefined): number {
	return DISCOVERY_FIELDS.filter(field => {
		if(profile?.skipped?.includes(field)) return false;
		const value = profile?.[field];
		if(field === "race") return Array.isArray(value) && value.length > 0 && value.every(item => (DISCOVERY_RACE_VALUES as readonly string[]).includes(item));
		return typeof value === "string" && (DISCOVERY_OPTIONS[field].options as readonly string[]).includes(value);
	}).length;
}

export type DiscoveryStats = { searches_this_week: number };

export type AccountSetup = {
	points: number;
	yalemoji_set: boolean;
	yalemoji_public: boolean;
	discovery_profile: DiscoveryProfile;
};

export function accountSetupPoints(avatarSet: boolean, avatarPublic: boolean, discovery: DiscoveryProfile): number {
	return Number(avatarSet) + Number(avatarPublic) + discoveryFieldsCompleted(discovery);
}

export function discoveryProfileHandled(profile: DiscoveryProfile | null | undefined): boolean {
	return DISCOVERY_FIELDS.every(field => profile?.skipped?.includes(field) || discoveryFieldsCompleted({ [field]: profile?.[field] } as DiscoveryProfile) === 1);
}

export const ACCOUNT_SETUP_MIN_POINTS = 4;

export function accountSetupFinished(setup: AccountSetup): boolean {
	return setup.points >= ACCOUNT_SETUP_MIN_POINTS && discoveryProfileHandled(setup.discovery_profile);
}
