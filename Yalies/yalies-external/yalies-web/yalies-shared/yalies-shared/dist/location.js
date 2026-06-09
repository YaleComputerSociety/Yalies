export const US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico", "GU": "Guam", "VI": "US Virgin Islands",
    "AS": "American Samoa", "MP": "Northern Mariana Islands",
};
export const COUNTRY_ALIASES = {
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
    "england": "United Kingdom",
    "scotland": "United Kingdom",
    "wales": "United Kingdom",
    "northern ireland": "United Kingdom",
    "usa": "United States",
    "u.s.a.": "United States",
    "u.s.": "United States",
    "united states of america": "United States",
    "korea": "South Korea",
    "republic of korea": "South Korea",
    "rok": "South Korea",
    "prc": "China",
    "p.r.c.": "China",
    "peoples republic of china": "China",
    "people's republic of china": "China",
    "hong kong sar": "Hong Kong",
    "uae": "United Arab Emirates",
    "u.a.e.": "United Arab Emirates",
    "roc": "Taiwan",
    "republic of china": "Taiwan",
    "czech republic": "Czech Republic",
    "czechia": "Czech Republic",
    "burma": "Myanmar",
    "ivory coast": "Ivory Coast",
    "cote d'ivoire": "Ivory Coast",
    "the netherlands": "Netherlands",
    "holland": "Netherlands",
    "the philippines": "Philippines",
};
const NOT_COUNTRIES = new Set([
    "south", "north", "east", "west", "the", "new", "san", "los", "el",
    "brooklyn", "chicago", "hialeah", "latham", "lexington", "pittsburgh",
    "plymouth", "san diego", "san francisco", "los angeles", "new york",
]);
function normalizeCountry(raw) {
    if (!raw || raw.length < 2)
        return null;
    const cleaned = raw.replace(/[,\s]+$/, "").trim();
    if (!cleaned || cleaned.length < 2)
        return null;
    const lower = cleaned.toLowerCase();
    if (NOT_COUNTRIES.has(lower))
        return null;
    if (/^[A-Z0-9]{2,}\s+[A-Z0-9]+$/i.test(cleaned))
        return null;
    if (COUNTRY_ALIASES[lower]) {
        return COUNTRY_ALIASES[lower];
    }
    if (cleaned.length === 2 && US_STATES[cleaned.toUpperCase()]) {
        return null;
    }
    if (cleaned.length >= 3 && cleaned.length <= 60 && /^[A-Z]/.test(cleaned)) {
        if (/^\d/.test(cleaned) || /\d{3,}/.test(cleaned))
            return null;
        return cleaned;
    }
    return null;
}
export function parseLocation(address) {
    if (!address || address.trim().length === 0) {
        return { address_state: null, address_country: null };
    }
    const lines = address.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
        return { address_state: null, address_country: null };
    }
    const lastLine = lines[lines.length - 1];
    const usMatch = lastLine.match(/,\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
    if (usMatch) {
        const stateCode = usMatch[1];
        if (US_STATES[stateCode]) {
            return {
                address_state: stateCode,
                address_country: "United States",
            };
        }
    }
    const commaIdx = lastLine.lastIndexOf(",");
    if (commaIdx >= 0) {
        const candidate = lastLine.substring(commaIdx + 1).trim();
        const cleaned = candidate.replace(/\s*\d{4,}[-\s]?\d*$/, "").trim();
        if (cleaned.length >= 2) {
            const normalized = normalizeCountry(cleaned);
            if (normalized) {
                return { address_state: null, address_country: normalized };
            }
        }
    }
    const wholeNormalized = normalizeCountry(lastLine);
    if (wholeNormalized) {
        return { address_state: null, address_country: wholeNormalized };
    }
    const stateFromName = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === lastLine.toLowerCase());
    if (stateFromName) {
        return { address_state: stateFromName[0], address_country: "United States" };
    }
    return { address_state: null, address_country: null };
}
//# sourceMappingURL=location.js.map