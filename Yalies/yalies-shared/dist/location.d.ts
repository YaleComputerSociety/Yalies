/**
 * Parses an address string to extract US state or international country.
 *
 * Address format: multi-line, newline-separated.
 * Last line is typically "City, ST ZIP" (US) or "City, Country" (international).
 */
export declare const US_STATES: Record<string, string>;
export declare const COUNTRY_ALIASES: Record<string, string>;
export type ParsedLocation = {
    address_state: string | null;
    address_country: string | null;
};
export declare function parseLocation(address: string | null | undefined): ParsedLocation;
//# sourceMappingURL=location.d.ts.map