export type Person = {
    // Identifiers
    netid?: string;
    upi?: number;
    email?: string;
    mailbox?: string;
    phone?: string;
    fax?: string;
    
    // Naming
    title?: string;
    first_name: string;
    preferred_name?: string;
    middle_name?: string;
    last_name: string;
    suffix?: string;
    pronouns?: string;

    phonetic_name?: string;
    name_recording?: string;

    // Misc
    address?: string;

    // Students
    school?: string;
    school_code?: string;
    year?: number;
    curriculum?: string;
    
    // Undergrads
    college?: string;
    college_code?: string;
    leave?: boolean;
    visitor?: boolean;
    image?: string;
    birth_month?: number;
    birth_day?: number;
    major?: string;
    access_code?: string;

    // Staff
    organization?: string;
    organization_code?: string;
    unit_class?: string;
    unit_code?: string;
    unit?: string;
    postal_address?: string;
    office_building?: string;
    office_room?: string;
    cv?: string;
    profile?: string;
    website?: string;
    education?: string;
    publications?: string;
};

export type ApiKey = {
	id: number;
	description: string;
	created_on: Date;
	uses_count: number;
	key?: string;
};
