import { DEFAULT_FILTER_FIELDS, Person, UserProfile } from "yalies-shared";

type PersonWithProfile = Person & {
	id: number;
	user_profile?: UserProfile;
	like_data?: { like_count: number; liked_by_me: boolean };
	friend_data?: { status: string; count: number };
};

type PeopleQuery = {
	query?: string | null;
	filters?: Record<string, unknown>;
	page?: number;
	page_size?: number;
};

export function isMockDirectoryEnabled() {
	return process.env.MOCK_DIRECTORY === "true" ||
		(process.env.NODE_ENV === "development" && !process.env.DATABASE_URL);
}

export const MOCK_DIRECTORY_NETID = "demo1";

export const MOCK_PEOPLE: PersonWithProfile[] = [
	{
		id: 1,
		netid: "demo1",
		upi: 10000001,
		email: "maya.chen@yale.edu",
		first_name: "Maya",
		preferred_name: "Maya",
		middle_name: "Iris",
		last_name: "Chen",
		pronouns: "she/her",
		school: "Yale College",
		school_code: "YC",
		year: 2027,
		curriculum: "Undergraduate",
		college: "Grace Hopper College",
		college_code: "GH",
		major: "Computer Science",
		address: "New Haven, CT",
		address_state: "CT",
		address_country: "United States",
		birth_month: 6,
		birth_day: 11,
		user_profile: {
			netid: "demo1",
			description: "Builds playful tools for campus groups and likes making data feel approachable.",
			interests: ["Design Systems", "Civic Tech", "Running"],
			classes: ["CPSC 419", "PLSC 118"],
		},
		like_data: { like_count: 12, liked_by_me: false },
		friend_data: { status: "none", count: 8 },
	},
	{
		id: 2,
		netid: "demo2",
		upi: 10000002,
		email: "leo.martinez@yale.edu",
		first_name: "Leo",
		last_name: "Martinez",
		pronouns: "he/him",
		school: "Yale College",
		school_code: "YC",
		year: 2026,
		curriculum: "Undergraduate",
		college: "Berkeley College",
		college_code: "BK",
		major: "Economics",
		address: "Austin, TX",
		address_state: "TX",
		address_country: "United States",
		birth_month: 9,
		birth_day: 5,
		user_profile: {
			netid: "demo2",
			description: "Interested in markets, transit, and student journalism.",
			interests: ["Finance", "Public Policy", "Photography"],
			classes: ["ECON 421", "S&DS 238"],
		},
		like_data: { like_count: 7, liked_by_me: true },
		friend_data: { status: "accepted", count: 14 },
	},
	{
		id: 3,
		netid: "demo3",
		upi: 10000003,
		email: "nora.patel@yale.edu",
		first_name: "Nora",
		last_name: "Patel",
		pronouns: "she/her",
		school: "Yale College",
		school_code: "YC",
		year: 2028,
		curriculum: "Undergraduate",
		college: "Silliman College",
		college_code: "SM",
		major: "Molecular Biophysics and Biochemistry",
		address: "Seattle, WA",
		address_state: "WA",
		address_country: "United States",
		birth_month: 1,
		birth_day: 22,
		user_profile: {
			netid: "demo3",
			description: "Works in a lab and organizes low-key study sessions.",
			interests: ["Biotech", "Research", "Baking"],
			classes: ["MB&B 300", "CHEM 333"],
		},
		like_data: { like_count: 19, liked_by_me: false },
		friend_data: { status: "pending_sent", count: 11 },
	},
	{
		id: 4,
		netid: "demo4",
		upi: 10000004,
		email: "samuel.okafor@yale.edu",
		first_name: "Samuel",
		preferred_name: "Sam",
		last_name: "Okafor",
		pronouns: "he/him",
		school: "Yale College",
		school_code: "YC",
		year: 2029,
		curriculum: "Undergraduate",
		college: "Pauli Murray College",
		college_code: "MY",
		major: "Political Science",
		address: "Lagos, Nigeria",
		address_country: "Nigeria",
		birth_month: 4,
		birth_day: 18,
		user_profile: {
			netid: "demo4",
			description: "Debate, international affairs, and building better club handoffs.",
			interests: ["Debate", "International Relations", "Mentorship"],
			classes: ["PLSC 114", "EP&E 215"],
		},
		like_data: { like_count: 5, liked_by_me: false },
		friend_data: { status: "none", count: 6 },
	},
	{
		id: 5,
		netid: "demo5",
		upi: 10000005,
		email: "ella.roberts@yale.edu",
		first_name: "Ella",
		last_name: "Roberts",
		pronouns: "she/they",
		school: "Yale College",
		school_code: "YC",
		year: 2026,
		curriculum: "Undergraduate",
		college: "Morse College",
		college_code: "MC",
		major: "Architecture",
		address: "London, United Kingdom",
		address_country: "United Kingdom",
		birth_month: 12,
		birth_day: 3,
		user_profile: {
			netid: "demo5",
			description: "Sketches campus spaces and helps with theater sets.",
			interests: ["Architecture", "Theater", "Urbanism"],
			classes: ["ARCH 150", "THST 210"],
		},
		like_data: { like_count: 16, liked_by_me: true },
		friend_data: { status: "accepted", count: 18 },
	},
	{
		id: 6,
		netid: "demo6",
		upi: 10000006,
		email: "adrian.kim@yale.edu",
		first_name: "Adrian",
		last_name: "Kim",
		pronouns: "they/them",
		school: "Yale College",
		school_code: "YC",
		year: 2027,
		curriculum: "Undergraduate",
		college: "Davenport College",
		college_code: "DC",
		major: "Statistics and Data Science",
		address: "Toronto, Canada",
		address_country: "Canada",
		birth_month: 7,
		birth_day: 30,
		user_profile: {
			netid: "demo6",
			description: "Likes clean datasets, intramurals, and tiny automations.",
			interests: ["Data Science", "Basketball", "Automation"],
			classes: ["S&DS 365", "CPSC 223"],
		},
		like_data: { like_count: 10, liked_by_me: false },
		friend_data: { status: "none", count: 9 },
	},
	{
		id: 7,
		netid: "demo7",
		upi: 10000007,
		email: "zoe.sullivan@yale.edu",
		first_name: "Zoe",
		last_name: "Sullivan",
		pronouns: "she/her",
		school: "Yale College",
		school_code: "YC",
		year: 2028,
		curriculum: "Undergraduate",
		college: "Jonathan Edwards College",
		college_code: "JE",
		major: "English",
		address: "Chicago, IL",
		address_state: "IL",
		address_country: "United States",
		birth_month: 2,
		birth_day: 14,
		user_profile: {
			netid: "demo7",
			description: "Writes essays, edits zines, and runs a reading group.",
			interests: ["Creative Writing", "Publishing", "Film"],
			classes: ["ENGL 120", "FILM 160"],
		},
		like_data: { like_count: 4, liked_by_me: false },
		friend_data: { status: "pending_received", count: 5 },
	},
	{
		id: 8,
		netid: "demo8",
		upi: 10000008,
		email: "omar.hassan@yale.edu",
		first_name: "Omar",
		last_name: "Hassan",
		pronouns: "he/him",
		school: "School of Engineering & Applied Science",
		school_code: "SEAS",
		year: 2026,
		curriculum: "Graduate",
		major: "Mechanical Engineering",
		organization: "Robotics Lab",
		address: "Cairo, Egypt",
		address_country: "Egypt",
		birth_month: 10,
		birth_day: 9,
		user_profile: {
			netid: "demo8",
			description: "Graduate student working on robot manipulation.",
			interests: ["Robotics", "Hardware", "Teaching"],
			classes: ["MENG 472", "CPSC 575"],
		},
		like_data: { like_count: 13, liked_by_me: false },
		friend_data: { status: "none", count: 12 },
	},
	{
		id: 9,
		netid: "demo9",
		upi: 10000009,
		email: "isabel.garcia@yale.edu",
		first_name: "Isabel",
		preferred_name: "Isa",
		last_name: "Garcia",
		pronouns: "she/her",
		school: "Yale College",
		school_code: "YC",
		year: 2029,
		curriculum: "Undergraduate",
		college: "Pierson College",
		college_code: "PC",
		major: "History of Art",
		address: "San Juan, Puerto Rico",
		address_country: "United States",
		birth_month: 5,
		birth_day: 2,
		user_profile: {
			netid: "demo9",
			description: "Museum person, coffee enthusiast, and first-year adviser in training.",
			interests: ["Museums", "Languages", "Coffee"],
			classes: ["HSAR 112", "SPAN 150"],
		},
		like_data: { like_count: 6, liked_by_me: true },
		friend_data: { status: "accepted", count: 7 },
	},
	{
		id: 10,
		netid: "demo10",
		upi: 10000010,
		email: "jules.morgan@yale.edu",
		first_name: "Jules",
		last_name: "Morgan",
		pronouns: "they/she",
		school: "Yale College",
		school_code: "YC",
		year: 2027,
		curriculum: "Undergraduate",
		college: "Saybrook College",
		college_code: "SY",
		major: "Music",
		address: "Nashville, TN",
		address_state: "TN",
		address_country: "United States",
		birth_month: 8,
		birth_day: 27,
		user_profile: {
			netid: "demo10",
			description: "Composer, pit orchestra regular, and late-night arranger.",
			interests: ["Music", "Audio", "Theater"],
			classes: ["MUSI 211", "CPSC 112"],
		},
		like_data: { like_count: 15, liked_by_me: false },
		friend_data: { status: "none", count: 10 },
	},
];

const searchableFields: (keyof Person)[] = [
	"first_name",
	"preferred_name",
	"middle_name",
	"last_name",
	"email",
	"netid",
	"college",
	"major",
	"school",
	"organization",
	"address_country",
];

function includesValue(person: Person, key: string, expected: unknown): boolean {
	const actual = person[key as keyof Person];
	if (actual === undefined || actual === null) return false;
	if (key === "address_country" && typeof expected === "string") {
		return actual === expected || String(person.address || "").includes(expected);
	}
	return String(actual) === String(expected);
}

function matchesFilters(person: Person, filters: Record<string, unknown>): boolean {
	return Object.entries(filters).every(([key, value]) => {
		if (value === undefined || value === null) return true;
		if (Array.isArray(value)) {
			if (value.length === 0) return true;
			return value.some((item) => includesValue(person, key, item));
		}
		return includesValue(person, key, value);
	});
}

function matchesQuery(person: Person, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	if (/^[a-z]{2}$/i.test(normalized)) {
		return person.first_name.toLowerCase().startsWith(normalized[0]) &&
			person.last_name.toLowerCase().startsWith(normalized[1]);
	}

	const haystack = searchableFields
		.map((field) => person[field])
		.filter((value) => value !== undefined && value !== null)
		.join(" ")
		.toLowerCase();
	return normalized.split(/\s+/).every((word) => haystack.includes(word));
}

function matchesSearchText(person: Person, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	const haystack = searchableFields
		.map((field) => person[field])
		.filter((value) => value !== undefined && value !== null)
		.join(" ")
		.toLowerCase();
	return normalized.split(/\s+/).every((word) => haystack.includes(word));
}

function summarizePerson(person: PersonWithProfile) {
	return {
		netid: person.netid,
		first_name: person.first_name,
		last_name: person.last_name,
		image: person.image,
		college: person.college,
		year: person.year,
		school: person.school,
	};
}

export function getMockPeople({ query = "", filters = {}, page = 0, page_size = 100 }: PeopleQuery): Person[] {
	const pageNumber = Number(page) || 0;
	const pageSize = Number(page_size) || 100;
	return MOCK_PEOPLE
		.filter((person) => matchesFilters(person, filters))
		.filter((person) => matchesQuery(person, query || ""))
		.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize);
}

export function getMockSuggestions(query: string, limit = 8) {
	const normalized = query.trim().toLowerCase();
	if (normalized.length < 2) return [];

	return MOCK_PEOPLE
		.filter((person) => matchesSearchText(person, normalized) || person.netid?.startsWith(normalized))
		.slice(0, limit)
		.map(summarizePerson);
}

export function getMockFilters(): Record<string, unknown[]> {
	const filters: Record<string, unknown[]> = {};
	for (const field of DEFAULT_FILTER_FIELDS) {
		filters[field] = [...new Set(
			MOCK_PEOPLE
				.map((person) => person[field])
				.filter((value) => value !== undefined && value !== null && value !== "")
		)].sort();
	}
	return filters;
}

export function getMockProfile(netid: string): UserProfile {
	return MOCK_PEOPLE.find((person) => person.netid === netid)?.user_profile || { netid };
}

export function getMockPerson(netid: string): Person | null {
	return MOCK_PEOPLE.find((person) => person.netid === netid) || null;
}

export function getMockFriendStatus(netid: string) {
	const person = MOCK_PEOPLE.find((p) => p.netid === netid);
	return person?.friend_data || { status: "none", count: 0 };
}

export function getMockLikes(netid: string) {
	const person = MOCK_PEOPLE.find((p) => p.netid === netid);
	return {
		count: person?.like_data?.like_count || 0,
		liked: person?.like_data?.liked_by_me || false,
	};
}
