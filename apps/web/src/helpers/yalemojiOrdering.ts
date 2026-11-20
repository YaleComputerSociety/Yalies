import type { Person } from "yalies-shared";

function hasYaleMoji(person: Person) {
	return Boolean(person.yalemoji?.png_url);
}

// Stable partitions keep the API's proximity ranking within each group.
export function prioritizeYaleMojis(people: Person[]): Person[] {
	return [...people.filter(hasYaleMoji), ...people.filter(person => !hasYaleMoji(person))];
}

export function prioritizeYaleMojisWithinYear(people: Person[]): Person[] {
	const years = new Map<Person["year"], { people: Person[]; next: number }>();
	for(const person of people) {
		let group = years.get(person.year);
		if(!group) {
			group = { people: [], next: 0 };
			years.set(person.year, group);
		}
		group.people.push(person);
	}
	years.forEach(group => { group.people = prioritizeYaleMojis(group.people); });
	// Preserve the API's year order, including any interleaved or missing years.
	return people.map(person => {
		const group = years.get(person.year)!;
		return group.people[group.next++];
	});
}

// Apply to each incoming browse batch so loading more never moves earlier cards.
export function spreadYaleMojis(people: Person[]): Person[] {
	const avatars = people.filter(hasYaleMoji);
	if(avatars.length === 0) return [...people];
	const others = people.filter(person => !hasYaleMoji(person));
	const gap = Math.min(3, others.length / avatars.length);
	const ordered: Person[] = [];
	let nextOther = 0;
	for(let index = 0; index < avatars.length; index++) {
		ordered.push(avatars[index]);
		const end = Math.ceil((index + 1) * gap);
		while(nextOther < end) ordered.push(others[nextOther++]);
	}
	return [...ordered, ...others.slice(nextOther)];
}
