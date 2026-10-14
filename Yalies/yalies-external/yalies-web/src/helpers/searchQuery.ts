import type { SearchMode } from "@/components/SearchModeToggle";

const COLLEGE_EXPAND: Record<string, string> = {
	BK: "Berkeley College",
	BR: "Branford College",
	DC: "Davenport College",
	BF: "Benjamin Franklin College",
	ES: "Ezra Stiles College",
	GH: "Grace Hopper College",
	JE: "Jonathan Edwards College",
	MO: "Morse College",
	MY: "Pauli Murray College",
	PM: "Pauli Murray College",
	PC: "Pierson College",
	SM: "Silliman College",
	SI: "Silliman College",
	SY: "Saybrook College",
	TD: "Timothy Dwight College",
	TR: "Trumbull College",
};

export function parseSearch(query: string, searchMode: SearchMode, filters: Record<string, string[]>) {
	const filterObject = Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length > 0));
	const words = query.trim().split(/\s+/);
	let endOfName = words.length;
	for (let i = 1; i < words.length; i++) {
		const word = words[i];
		if (/^['’][0-9]{2}$/.test(word)) {
			filterObject.year = ["20" + word.slice(1)];
			endOfName = Math.min(endOfName, i);
		} else if (/^[0-9]{2}$/.test(word)) {
			filterObject.year = ["20" + word];
			endOfName = Math.min(endOfName, i);
		} else if (Object.hasOwn(COLLEGE_EXPAND, word)) {
			filterObject.college = [COLLEGE_EXPAND[word]];
			endOfName = Math.min(endOfName, i);
		}
	}

	let queryActual = words.slice(0, endOfName).join(" ");
	let resolvedSearchMode = searchMode;
	if (searchMode === "full_name") {
		if (/^[a-z]{2,}\d{1,4}$/i.test(queryActual)) {
			filterObject.netid = [queryActual];
			queryActual = "";
		} else if (/^\d{8}$/.test(queryActual)) {
			filterObject.upi = [queryActual];
			queryActual = "";
		} else if (/^[A-Z]{2}$/.test(queryActual)) {
			resolvedSearchMode = "initials";
		}
	}
	return { queryActual, resolvedSearchMode, filterObject };
}
