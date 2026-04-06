import { ValidationResult, DatabasePerson } from "yalies-shared";
export type { ValidationResult };
export type DatabaseStudent = DatabasePerson;

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
	withLocation: number;
	colleges: { name: string; count: number }[];
	years: { year: number; count: number }[];
	schools: { name: string; count: number }[];
	locations: { name: string; count: number }[];
};

export type DatabaseStudentsResponse = {
	students: DatabaseStudent[];
	total: number;
	page: number;
	pageSize: number;
};

