export type Post = {
	id: number;
	author_netid: string;
	type: "team" | "recruiting" | "showcase";
	title: string;
	description: string;
	tags: string[];
	category: string;
	competition_name?: string;
	competition_date?: string;
	competition_url?: string;
	spots_total?: number;
	status: "open" | "closed" | "archived";
	created_at: string;
	updated_at: string;
	members?: PostMember[];
	interest_count?: number;
	is_interested?: boolean;
};

export type PostMember = {
	netid: string;
	role: "creator" | "member";
	joined_at: string;
};

export type PostInterest = {
	netid: string;
	message?: string;
	created_at: string;
};

export const POST_TYPES = [
	{ value: "team", label: "Looking for Team" },
	{ value: "recruiting", label: "Recruiting" },
	{ value: "showcase", label: "Showcase" },
] as const;

export const CATEGORIES = [
	{ value: "competition", label: "Competition" },
	{ value: "hackathon", label: "Hackathon" },
	{ value: "startup", label: "Startup" },
	{ value: "research", label: "Research" },
	{ value: "club", label: "Club Project" },
	{ value: "side_project", label: "Side Project" },
	{ value: "class_project", label: "Class Project" },
] as const;

export const COMMON_TAGS = [
	"Frontend", "Backend", "Full Stack", "ML/AI", "Data Science",
	"Design", "Mobile", "DevOps", "Finance", "Marketing",
	"Product", "Research", "Hardware", "Blockchain", "Cybersecurity",
	"Game Dev", "NLP", "Computer Vision", "Robotics", "Biotech",
] as const;
