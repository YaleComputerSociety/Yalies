"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faCheck, faCopy, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import styles from "./emailcopybutton.module.scss";

function fallbackCopy(text: string) {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	document.body.removeChild(textarea);
}

export function CopyButton({
	value,
	displayValue,
	icon,
	copyLabel,
	className,
	stopPropagation,
	iconOnly = false,
}: {
	value: string;
	displayValue?: string;
	icon: IconProp;
	copyLabel: string;
	className?: string;
	stopPropagation?: boolean;
	iconOnly?: boolean;
}) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
		if(stopPropagation) event.stopPropagation();

		try {
			if(navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
			} else {
				fallbackCopy(value);
			}
			setCopied(true);
			if(timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => setCopied(false), 1200);
		} catch(e) {
			console.error(e);
		}
	};

	return (
		<button
			type="button"
			className={`${styles.email_button} ${className ?? ""}`}
			onClick={handleClick}
			aria-label={copied ? `${copyLabel} copied` : `Copy ${copyLabel}`}
			title={copied ? "Copied" : `Copy ${copyLabel}`}
		>
			<span className={styles.icon_wrap} aria-hidden="true">
				<FontAwesomeIcon icon={icon} className={styles.primary_icon} />
				<FontAwesomeIcon icon={copied ? faCheck : faCopy} className={styles.copy_icon} />
			</span>
			{!iconOnly && <span>{copied ? "Copied" : (displayValue ?? value)}</span>}
		</button>
	);
}

export default function EmailCopyButton({
	email,
	className,
	stopPropagation,
	iconOnly,
}: {
	email: string;
	className?: string;
	stopPropagation?: boolean;
	iconOnly?: boolean;
}) {
	return (
		<CopyButton
			value={email}
			displayValue={email.replace(/@yale\.edu$/i, "")}
			icon={faEnvelope}
			copyLabel="email"
			className={className}
			stopPropagation={stopPropagation}
			iconOnly={iconOnly}
		/>
	);
}
