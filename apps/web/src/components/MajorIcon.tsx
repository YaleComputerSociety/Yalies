import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
	faBatteryHalf, faBook, faBrain, faBriefcase, faChartLine,
	faLaptop, faDna, faDraftingCompass, faFlask, faLandmark,
} from "@fortawesome/free-solid-svg-icons";
import { getMajorIconKind, type MajorIconKind } from "@/helpers/majorIconKind";

const icons: Record<Exclude<MajorIconKind, "planet">, IconDefinition> = {
	computer: faLaptop,
	flask: faFlask,
	brain: faBrain,
	dna: faDna,
	calculator: faChartLine,
	battery: faBatteryHalf,
	briefcase: faBriefcase,
	government: faLandmark,
	drafting: faDraftingCompass,
	book: faBook,
};

export default function MajorIcon({ major }: { major: string }) {
	const kind = getMajorIconKind(major);
	if(kind === "planet") {
		return <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
			<circle cx="12" cy="12" r="6" fill="currentColor" />
			<ellipse cx="12" cy="12" rx="11" ry="3.7" transform="rotate(-28 12 12)"
				fill="none" stroke="currentColor" strokeWidth="1.8" />
		</svg>;
	}
	return <FontAwesomeIcon icon={icons[kind]} />;
}
