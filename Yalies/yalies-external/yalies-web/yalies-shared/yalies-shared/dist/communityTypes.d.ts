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
export declare const POST_TYPES: readonly [{
    readonly value: "team";
    readonly label: "Looking for Team";
}, {
    readonly value: "recruiting";
    readonly label: "Recruiting";
}, {
    readonly value: "showcase";
    readonly label: "Showcase";
}];
export declare const CATEGORIES: readonly [{
    readonly value: "competition";
    readonly label: "Competition";
}, {
    readonly value: "hackathon";
    readonly label: "Hackathon";
}, {
    readonly value: "startup";
    readonly label: "Startup";
}, {
    readonly value: "research";
    readonly label: "Research";
}, {
    readonly value: "club";
    readonly label: "Club Project";
}, {
    readonly value: "side_project";
    readonly label: "Side Project";
}, {
    readonly value: "class_project";
    readonly label: "Class Project";
}];
export declare const COMMON_TAGS: readonly ["Frontend", "Backend", "Full Stack", "ML/AI", "Data Science", "Design", "Mobile", "DevOps", "Finance", "Marketing", "Product", "Research", "Hardware", "Blockchain", "Cybersecurity", "Game Dev", "NLP", "Computer Vision", "Robotics", "Biotech"];
//# sourceMappingURL=communityTypes.d.ts.map