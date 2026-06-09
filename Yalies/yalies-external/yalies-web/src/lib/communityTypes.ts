export type { Post, PostMember, PostInterest } from "yalies-shared";
export { POST_TYPES, CATEGORIES, COMMON_TAGS } from "yalies-shared";

export const TYPE_LABELS: Record<string, string> = {
	team: "Looking for Team",
	recruiting: "Recruiting",
	showcase: "Showcase",
};

export const CATEGORY_LABELS: Record<string, string> = {
	competition: "Competition",
	hackathon: "Hackathon",
	startup: "Startup",
	research: "Research",
	club: "Club Project",
	side_project: "Side Project",
	class_project: "Class Project",
};
