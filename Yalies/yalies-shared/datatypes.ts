export type Person = {

    netid?: string;
    upi?: number;
    email?: string;
    mailbox?: string;
    phone?: string;
    fax?: string;

    title?: string;
    first_name: string;
    preferred_name?: string;
    middle_name?: string;
    last_name: string;
    suffix?: string;
    pronouns?: string;

    phonetic_name?: string;
    name_recording?: string;

    address?: string;
    address_state?: string;
    address_country?: string;

    school?: string;
    school_code?: string;
    year?: number;
    curriculum?: string;

    college?: string;
    college_code?: string;
    leave?: boolean;
    visitor?: boolean;
    image?: string;
    birth_month?: number;
    birth_day?: number;
    major?: string;
    access_code?: string;

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

export type DataChangeRequest = {
	id: number;
	requester_netid: string;
	target_netid: string;
	status: "pending" | "approved" | "denied";
	requested_changes: Record<string, string | number | null>;
	admin_notes?: string;
	created_at: string;
	resolved_at?: string;
	resolved_by?: string;

	requester_name?: string;
};

export const CHANGE_REQUEST_ALLOWED_FIELDS = [

	"netid", "upi", "email", "mailbox", "phone", "fax",

	"title", "first_name", "preferred_name", "middle_name", "last_name",
	"suffix", "pronouns", "phonetic_name", "name_recording",

	"address", "address_state", "address_country",

	"school", "school_code", "year", "curriculum",

	"college", "college_code", "major", "birth_month", "birth_day",

	"organization", "organization_code", "unit_class", "unit_code", "unit",
	"postal_address", "office_building", "office_room",
	"cv", "profile", "website", "education", "publications",
] as const;

export type DbRow = Partial<Person> & {
	id: number;
	first_name: string;
	last_name: string;
	school: string;
	school_code: string;
	address_state?: string | null;
	address_country?: string | null;
};
