import { Person } from "yalies-shared";

function normalize(value: string) {
	return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function filterSavedPeople(people: Person[], query: string, year: string, college: string) {
	const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
	return people.filter(person => {
		if(year && String(person.year ?? "") !== year) return false;
		if(college && person.college !== college) return false;
		const text = normalize([person.first_name, person.preferred_name, person.middle_name, person.last_name, person.saved_data?.note].filter(Boolean).join(" "));
		return terms.every(term => text.includes(term));
	});
}

export function getListClipboard(people: Person[], field: "netid" | "email") {
	const values = new Map<string, string>();
	let missing = 0;
	for(const person of people) {
		const value = person[field]?.trim();
		if(value) values.set(value.toLowerCase(), value);
		else missing++;
	}
	return { text: Array.from(values.values()).join("\n"), count: values.size, missing };
}

export function savedPeopleForList(people: Person[], getEntry: (person: Person) => { listIds: number[]; note: string | null } | null, listId?: number): Person[] {
	const unique = new Map<string, Person>();
	for(const person of people) {
		const entry = getEntry(person);
		if(!person.netid || !entry?.listIds.length || (listId !== undefined && !entry.listIds.includes(listId))) continue;
		unique.set(person.netid.trim().toLowerCase(), { ...person,
			saved_data: { saved: true, note: entry.note, list_ids: entry.listIds },
		});
	}
	return Array.from(unique.values());
}
