"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./profilebutton.module.scss";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useMemo, useRef, useState } from "react";

export default function ProfileButton({
	isAuthenticated,
}: {
	isAuthenticated?: boolean;
}) {
	const [active, setActive] = useState(false);
	const popupRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) setActive(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const popup = useMemo(() => (
		<div className={styles.popup} ref={popupRef}>
			{
				isAuthenticated ? (
					<a href={process.env.NEXT_PUBLIC_YALIES_API_URL + "/v2/login/logout"}>
						<div className={styles.button}>
							Log out
						</div>
					</a>
				) : (
					<a href={process.env.NEXT_PUBLIC_YALIES_API_URL + "/v2/login"}>
						<div className={styles.button}>
							Log in
						</div>
					</a>
				)
			}
		</div>
	), [isAuthenticated]);

	return (
		<div className={styles.profile_button}>
			<button onClick={() => setActive(!active)}>
				<FontAwesomeIcon icon={faUser} />
			</button>
			{active && popup}
		</div>
	);
}
