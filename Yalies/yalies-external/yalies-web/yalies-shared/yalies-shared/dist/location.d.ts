export declare const US_STATES: Record<string, string>;
export declare const COUNTRY_ALIASES: Record<string, string>;
export type ParsedLocation = {
    address_state: string | null;
    address_country: string | null;
};
export declare function parseLocation(address: string | null | undefined): ParsedLocation;
//# sourceMappingURL=location.d.ts.map