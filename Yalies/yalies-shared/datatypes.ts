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
    address_state?: string;
    address_country?: string;

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

    // Inline data (included in people search results)
    user_profile?: UserProfile;
    like_data?: { like_count: number; liked_by_me: boolean };
    friend_data?: { status: string; count: number };
};

export type ApiKey = {
	id: number;
	description: string;
	created_on: Date;
	uses_count: number;
	key?: string;
};

export type UserProfile = {
	netid: string;
	description?: string;
	interests?: string[];
	linkedin_url?: string;
	instagram_url?: string;
	classes?: string[];
	updated_at?: Date;
};

export type ValidationResult = {
	passes: string[];
	warnings: string[];
	failures: string[];
};

// Full database row — all Person fields as nullable + DB-specific columns.
// Used by the dashboard to display/edit student records.
export type DatabasePerson = {
	[K in keyof Person]: Person[K] | null;
} & {
	id: number;
	birthday?: string | null;
	residence?: string | null;
	linkedin_url?: string | null;
	instagram_url?: string | null;
	classes?: string[] | null;
};

// Row shape for pipeline DB inserts — Person fields + required id.
export type DbRow = Partial<Person> & {
	id: number;
	first_name: string;
	last_name: string;
	school: string;
	school_code: string;
	address_state?: string | null;
	address_country?: string | null;
};
