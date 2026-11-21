import { DISCOVERY_FIELDS, DISCOVERY_OPTIONS, DISCOVERY_RACE_VALUES, type DiscoveryProfile, type DiscoveryField } from "yalies-shared";

export function parseDiscoveryUpdate(body: unknown): DiscoveryProfile | { skip: DiscoveryField } {
	if(!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Choose a discovery option.");
	const entries = Object.entries(body);
	if(entries.length === 1 && entries[0][0] === "skip" && DISCOVERY_FIELDS.includes(entries[0][1] as DiscoveryField)) return { skip: entries[0][1] as DiscoveryField };
	if(!entries.length) throw new Error("Choose a discovery option.");
	for(const [field, value] of entries) {
		if(!DISCOVERY_FIELDS.includes(field as DiscoveryField)) throw new Error("Unknown discovery field.");
		const options: readonly string[] = field === "race" ? DISCOVERY_RACE_VALUES : DISCOVERY_OPTIONS[field as DiscoveryField].options;
		if(field === "race" ? !Array.isArray(value) || value.some(item => typeof item !== "string" || !options.includes(item)) || new Set(value).size !== value.length : typeof value !== "string" || !options.includes(value)) {
			throw new Error("Choose a valid option. Saved discovery fields cannot be cleared.");
		}
	}
	return Object.fromEntries(entries) as DiscoveryProfile;
}

// Preserve answered fields when consolidating older choices into the new options.
const LEGACY_CHOICES: Record<DiscoveryField, Record<string, string>> = {
	gender: { Woman: "Female", Man: "Male", "Another identity": "Other" },
	sexuality: { Bisexual: "Bi", Pansexual: "Other", Asexual: "Other", Queer: "Other", Questioning: "Other", "Another identity": "Other" },
	religion: { Agnostic: "None", Atheist: "None", Hindu: "Other", Buddhist: "Other", Sikh: "Other", Spiritual: "Other", "Another religion": "Other" },
	race: {
		"Hispanic or Latino": "Latino", "Multiracial": "Mixed", "Another identity": "Other",
		"Middle Eastern or North African": "Other", "Native American or Alaska Native": "Other",
		"Native Hawaiian or Pacific Islander": "Other",
	},
};
const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

// Both the API and database enforce nonempty, valid choices. Once a field is
// filled, an update can replace its choice but cannot reset it to NULL.
export const DISCOVERY_SETUP_SQL = `
	CREATE TABLE IF NOT EXISTS discovery_profile (
		netid VARCHAR(255) PRIMARY KEY,
		${DISCOVERY_FIELDS.map(field => `${field} TEXT`).join(",\n\t\t")},
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	${DISCOVERY_FIELDS.map(field => `ALTER TABLE discovery_profile ADD COLUMN IF NOT EXISTS skip_${field} BOOLEAN NOT NULL DEFAULT FALSE;`).join("\n")}
	${DISCOVERY_FIELDS.filter(field => field !== "race").map(field => `
		ALTER TABLE discovery_profile DROP CONSTRAINT IF EXISTS discovery_profile_${field}_check;
		UPDATE discovery_profile SET ${field} = CASE ${field}
			${Object.entries(LEGACY_CHOICES[field]).map(([oldValue, newValue]) => `WHEN ${sqlString(oldValue)} THEN ${sqlString(newValue)}`).join("\n\t\t\t")}
			ELSE ${field} END
		WHERE ${field} IN (${Object.keys(LEGACY_CHOICES[field]).map(sqlString).join(", ")});
		ALTER TABLE discovery_profile ADD CONSTRAINT discovery_profile_${field}_check
			CHECK (${field} IN (${DISCOVERY_OPTIONS[field].options.map(sqlString).join(", ")}));
	`).join("\n")}
	ALTER TABLE discovery_profile DROP CONSTRAINT IF EXISTS discovery_profile_race_check;
	DO $$ BEGIN
		IF (SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'discovery_profile' AND column_name = 'race') = 'text' THEN
			UPDATE discovery_profile SET race = 'Other' WHERE race IN ('Mixed', 'Multiracial', 'Another identity', 'Middle Eastern or North African', 'Native American or Alaska Native', 'Native Hawaiian or Pacific Islander');
			UPDATE discovery_profile SET race = 'Latino' WHERE race = 'Hispanic or Latino';
			ALTER TABLE discovery_profile ALTER COLUMN race TYPE TEXT[] USING CASE WHEN race IS NULL THEN NULL ELSE ARRAY[race] END;
		END IF;
	END $$;
	ALTER TABLE discovery_profile ADD CONSTRAINT discovery_profile_race_check CHECK (race <@ ARRAY[${DISCOVERY_RACE_VALUES.map(sqlString).join(", ")}]::TEXT[] AND array_position(race, NULL) IS NULL);
	CREATE OR REPLACE FUNCTION prevent_discovery_clear() RETURNS trigger AS $$
	BEGIN
		IF ${DISCOVERY_FIELDS.filter(field => field !== "race").map(field => `(OLD.${field} IS NOT NULL AND NEW.${field} IS NULL)`).join(" OR ")} THEN
			RAISE EXCEPTION 'Saved discovery fields cannot be cleared' USING ERRCODE = '23514';
		END IF;
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;
	DROP TRIGGER IF EXISTS discovery_profile_no_clear ON discovery_profile;
	CREATE TRIGGER discovery_profile_no_clear BEFORE UPDATE ON discovery_profile
		FOR EACH ROW EXECUTE FUNCTION prevent_discovery_clear();
`;
