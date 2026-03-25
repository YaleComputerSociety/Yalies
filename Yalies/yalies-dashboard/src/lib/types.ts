export type WizardStepId =
	| "facebook-cookie"
	| "facebook-scrape"
	| "directory-cookie"
	| "directory-enrich"
	| "review-sync";

export type StepStatus = "pending" | "active" | "running" | "done" | "error";

export type ProgressEvent = {
	type: "progress" | "complete" | "error" | "validation";
	message: string;
	count?: number;
	total?: number;
	stats?: Record<string, number | string>;
	validation?: ValidationResult;
};

export type ValidationResult = {
	passes: string[];
	warnings: string[];
	failures: string[];
};

export type PreviewData = {
	totalStudents: number;
	enrichedCount: number;
	colleges: number;
	years: number[];
	currentDbYcCount: number;
	diff: {
		toAdd: number;
		toRemove: number;
	};
	students: Record<string, unknown>[];
	validations: Record<string, ValidationResult>;
};

export type DatabaseOverview = {
	totalStudents: number;
	ycStudents: number;
	withNetid: number;
	withEmail: number;
	withImage: number;
	colleges: { name: string; count: number }[];
	years: { year: number; count: number }[];
	schools: { name: string; count: number }[];
};

export type DatabaseStudentsResponse = {
	students: DatabaseStudent[];
	total: number;
	page: number;
	pageSize: number;
};

export type DatabaseStudent = {
	// Identifiers
	id: number;
	netid: string | null;
	upi: number | null;
	email: string | null;
	mailbox: string | null;
	phone: string | null;
	fax: string | null;
	// Naming
	title: string | null;
	first_name: string;
	preferred_name: string | null;
	middle_name: string | null;
	last_name: string;
	suffix: string | null;
	pronouns: string | null;
	phonetic_name: string | null;
	name_recording: string | null;
	// Misc
	address: string | null;
	residence: string | null;
	// Students
	school: string | null;
	school_code: string | null;
	year: number | null;
	curriculum: string | null;
	// Undergrads
	college: string | null;
	college_code: string | null;
	leave: boolean | null;
	visitor: boolean | null;
	image: string | null;
	birthday: string | null;
	birth_month: number | null;
	birth_day: number | null;
	major: string | null;
	access_code: string | null;
	// Staff
	organization: string | null;
	organization_code: string | null;
	unit_class: string | null;
	unit_code: string | null;
	unit: string | null;
	postal_address: string | null;
	office_building: string | null;
	office_room: string | null;
	cv: string | null;
	profile: string | null;
	website: string | null;
	education: string | null;
	publications: string | null;
	// User profile (from user_profile table)
	linkedin_url: string | null;
	instagram_url: string | null;
	classes: string[] | null;
};
