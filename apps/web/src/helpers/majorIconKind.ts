export type MajorIconKind = "computer" | "flask" | "planet" | "brain" | "dna"
	| "calculator" | "battery" | "briefcase" | "government" | "drafting" | "book";

// Match the original major names, so editing a card's acronym doesn't change its icon.
export function getMajorIconKind(major: string): MajorIconKind {
	// Combined CS majors keep the computer, including EECS and CS + Psychology.
	if(/computer science|computing|comp sci/i.test(major)) return "computer";
	if(/astronomy|astrophysics|planetary/i.test(major)) return "planet";
	if(/psychology|cognitive science|neuroscience/i.test(major)) return "brain";
	if(/biology|devbio|biophysics|biochem|biomedical/i.test(major)) return "dna";
	if(/chemistry|chemical/i.test(major)) return "flask";
	if(/electrical|elec engineering/i.test(major)) return "battery";
	if(/political science|politics/i.test(major)) return "government";
	if(/economics|global affairs/i.test(major)) return "briefcase";
	if(/mathematics|statistics/i.test(major)) return "calculator";
	if(/engineering|physics/i.test(major)) return "drafting";
	return "book";
}
