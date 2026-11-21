import type { Person } from "yalies-shared";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInstagram, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { faIdCard } from "@fortawesome/free-solid-svg-icons";
import EmailCopyButton, { CopyButton } from "./EmailCopyButton";
import { normalizeExternalUrl } from "@/utils/externalUrl";
import styles from "./cardcontactactions.module.scss";

export default function CardContactActions({ person }: { person: Person }) {
	const instagram = normalizeExternalUrl(person.user_profile?.instagram_url);
	const linkedin = normalizeExternalUrl(person.user_profile?.linkedin_url);
	if(!person.netid && !instagram && !linkedin && !person.email) return null;
	return <div className={styles.actions}>
		{person.netid && <CopyButton value={person.netid} icon={faIdCard} copyLabel="NetID"
			iconOnly stopPropagation className={styles.control} />}
		{instagram && <a href={instagram} target="_blank" rel="noopener noreferrer"
			aria-label="Instagram" title="Instagram" className={styles.control} onClick={event => event.stopPropagation()}>
			<FontAwesomeIcon icon={faInstagram as IconProp} />
		</a>}
		{linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer"
			aria-label="LinkedIn" title="LinkedIn" className={styles.control} onClick={event => event.stopPropagation()}>
			<FontAwesomeIcon icon={faLinkedin as IconProp} />
		</a>}
		{person.email && <EmailCopyButton email={person.email} iconOnly stopPropagation className={styles.control} />}
	</div>;
}
