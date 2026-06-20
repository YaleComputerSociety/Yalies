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
const COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
    "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
    "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
    "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
    "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde",
    "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
    "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark",
    "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
    "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji",
    "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece",
    "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras",
    "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
    "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan",
    "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon",
    "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macau",
    "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
    "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia",
    "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal",
    "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea",
    "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama",
    "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
    "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
    "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
    "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
    "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea",
    "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
    "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo",
    "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
    "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
    "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen",
    "Zambia", "Zimbabwe",
];
const COUNTRY_BY_LOWER = {};
for (const c of COUNTRIES)
    COUNTRY_BY_LOWER[c.toLowerCase()] = c;
// Resolve a free-text fragment to a canonical country name, or null. Uses an
// explicit allowlist (aliases + known countries) instead of a heuristic, so it
// neither drops multi-word countries ("United Kingdom", "South Korea") nor
// accepts arbitrary capitalized tokens (cities like "Mumbai") as countries.
function normalizeCountry(raw) {
    if (!raw)
        return null;
    const cleaned = raw.replace(/[,\s]+$/, "").trim();
    if (cleaned.length < 2)
        return null;
    const lower = cleaned.toLowerCase();
    if (COUNTRY_ALIASES[lower])
        return COUNTRY_ALIASES[lower];
    if (COUNTRY_BY_LOWER[lower])
        return COUNTRY_BY_LOWER[lower];
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