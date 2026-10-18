import { decode } from "html-entities";

// Exact Yale College values reviewed from production on 2026-09-23.
// Includes Undeclared. Update the browser copy together; parity is tested.
export const ALLOWED_MAJORS: readonly string[] = Object.freeze([
	"African American Studies",
	"American Studies",
	"American Studies (Int.)",
	"Anthropology",
	"Applied Mathematics",
	"Applied Physics",
	"Archaeological Studies",
	"Architecture",
	"Art",
	"Astronomy",
	"Astrophysics",
	"Biomedical Engineering",
	"Chemical Engineering",
	"Chemistry",
	"Chemistry (Int.)",
	"Classical Civilization",
	"Classics",
	"Cognitive Science",
	"Comparative Literature",
	"Computer Science",
	"Computer Science & Econ",
	"Computer Science & Mathematics",
	"Computer Science & Psychology",
	"Computing and the Arts",
	"Computing & Linguistics",
	"Earth and Planetary Sciences",
	"East Asian Languages & Lits",
	"East Asian Studies",
	"Ecology & Evolutionary Biology",
	"Economics",
	"Economics & Mathematics",
	"Elec Engineering & Comp Sci",
	"Electrical Engineering",
	"Engineering Science-Chemical",
	"Engineering Science-Electrical",
	"Engineering Science-Mechanical",
	"Engineering Sci-Environmental",
	"English",
	"Environmental Engineering",
	"Environmental Studies",
	"Ethics,Politics & Economics",
	"Ethnicity, Race & Migration",
	"Film and Media Studies",
	"Film and Media Studies (Int.)",
	"French",
	"German Studies",
	"Global Affairs",
	"History",
	"History of Art",
	"History Science, Medicine & PH",
	"Humanities",
	"Italian Studies",
	"Latin American Studies",
	"Linguistics",
	"Mathematics",
	"Mathematics (Int.)",
	"Mathematics & Philosophy",
	"Mathematics & Physics",
	"Mechanical Engineering",
	"Molecular Biophysics & Biochem",
	"Molecular,Cellular,DevBio(Int)",
	"Molecular,Cellular,Dev Biology",
	"Music",
	"Music (Int.)",
	"Near Eastern Languages & Civs",
	"Neuroscience",
	"Philosophy",
	"Physics",
	"Physics & Geosciences",
	"Physics (Int.)",
	"Physics & Philosophy",
	"Political Science",
	"Political Science (Int.)",
	"Psychology",
	"Religious Studies",
	"Russ, E Eur & Eurasian Studies",
	"Sociology",
	"Sociology (Int.)",
	"Spanish",
	"Spanish (Int.)",
	"Statistics and Data Science",
	"TheaterDancePerformanceStudies",
	"Theater & Performance Studies",
	"Undeclared",
	"Urban Studies",
	"Women'sGender&SexualityStudies",
]);

const allowedMajors = new Set(ALLOWED_MAJORS);

// Decode transport escaping and trim only; never guess from substrings or aliases.
export function normalizeAllowedMajor(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const major = decode(value.trim()).trim();
	return allowedMajors.has(major) ? major : undefined;
}

export function findStudentsWithInvalidMajor<T extends { major?: unknown }>(students: T[]): T[] {
	return students.filter(({ major }) => {
		if (major === undefined || major === null) return false;
		if (typeof major === "string" && major.trim() === "") return false;
		return normalizeAllowedMajor(major) === undefined;
	});
}
