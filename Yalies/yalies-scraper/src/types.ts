export type FacebookStudent = {
	full_name: string;
	first_name: string;
	last_name: string;
	year: string;
	pronouns: string;
	college: string;
	phone?: string;
	address?: string;
	major?: string;
	birthday?: string;
	photo_id: string;
	details_raw: string;
};

export type DirectoryRecord = {
	NetId: string;
	EmailAddress: string;
	UPI: number;
	MailBox: string;
	PhoneNumber: string;
	FirstName: string;
	KnownAs: string;
	MiddleName: string;
	LastName: string;
	Suffix: string;
	DirectoryTitle: string;
	DisplayName: string;
	PrimarySchoolName: string;
	PrimarySchoolCode: string;
	StudentExpectedGraduationYear: number;
	StudentCurriculum: string;
	ResidentialCollegeCode: string;
	ResidentialCollegeName: string;
	OrganizationName: string;
	PrimaryOrganizationCode: string;
	OrganizationUnitName: string;
	PostalAddress: string;
	StudentAddress: string;
	RegisteredAddress: string;
	Matched: string;
};

export type DirectoryApiResponse = {
	Records: {
		TotalRecords: number;
		Record: DirectoryRecord | DirectoryRecord[];
	};
};

export type EnrichedStudent = FacebookStudent & {
	netid?: string;
	email?: string;
	upi?: number;
	mailbox?: string;
	phone_directory?: string;
	first_name_directory?: string;
	preferred_name?: string;
	middle_name?: string;
	suffix?: string;
	school?: string;
	school_code?: string;
	year_directory?: number;
	curriculum?: string;
	college_code?: string;
	college_directory?: string;
	organization?: string;
	organization_code?: string;
	unit?: string;
	title?: string;
	postal_address?: string;
	student_address?: string;
	registered_address?: string;
};

export type DbRow = {
	id: number;
	netid?: string;
	upi?: number;
	email?: string;
	mailbox?: string;
	phone?: string;
	first_name: string;
	preferred_name?: string;
	middle_name?: string;
	last_name: string;
	suffix?: string;
	pronouns?: string;
	school: string;
	school_code: string;
	year?: number;
	curriculum?: string;
	college?: string;
	college_code?: string;
	image?: string;
	birth_month?: number;
	birth_day?: number;
	major?: string;
	address?: string;
	organization?: string;
	organization_code?: string;
	unit?: string;
	postal_address?: string;
};

export type ValidationResult = {
	passes: string[];
	warnings: string[];
	failures: string[];
};
