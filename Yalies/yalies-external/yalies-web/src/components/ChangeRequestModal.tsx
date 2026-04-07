"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./changerequestmodal.module.scss";
import Input from "./Input";
import Button from "./Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

const FIELD_SECTIONS = [
	{
		label: "Name",
		fields: [
			{ key: "title", label: "Title" },
			{ key: "first_name", label: "First Name" },
			{ key: "preferred_name", label: "Preferred Name" },
			{ key: "middle_name", label: "Middle Name" },
			{ key: "last_name", label: "Last Name" },
			{ key: "suffix", label: "Suffix" },
			{ key: "pronouns", label: "Pronouns" },
			{ key: "phonetic_name", label: "Phonetic Name" },
			{ key: "name_recording", label: "Name Recording URL" },
		],
	},
	{
		label: "Identifiers & Contact",
		fields: [
			{ key: "netid", label: "NetID" },
			{ key: "upi", label: "UPI", type: "number" as const },
			{ key: "email", label: "Email" },
			{ key: "mailbox", label: "Mailbox" },
			{ key: "phone", label: "Phone" },
			{ key: "fax", label: "Fax" },
		],
	},
	{
		label: "Academics",
		fields: [
			{ key: "school", label: "School" },
			{ key: "school_code", label: "School Code" },
			{ key: "year", label: "Year", type: "number" as const },
			{ key: "college", label: "College" },
			{ key: "college_code", label: "College Code" },
			{ key: "major", label: "Major" },
			{ key: "curriculum", label: "Curriculum" },
		],
	},
	{
		label: "Personal",
		fields: [
			{ key: "address", label: "Address" },
			{ key: "address_state", label: "State" },
			{ key: "address_country", label: "Country" },
			{ key: "birth_month", label: "Birth Month (1-12)", type: "number" as const },
			{ key: "birth_day", label: "Birth Day (1-31)", type: "number" as const },
		],
	},
	{
		label: "Organization / Staff",
		fields: [
			{ key: "organization", label: "Organization" },
			{ key: "organization_code", label: "Organization Code" },
			{ key: "unit", label: "Unit" },
			{ key: "unit_class", label: "Unit Class" },
			{ key: "unit_code", label: "Unit Code" },
			{ key: "postal_address", label: "Postal Address" },
			{ key: "office_building", label: "Office Building" },
			{ key: "office_room", label: "Office Room" },
		],
	},
	{
		label: "Web & Publications",
		fields: [
			{ key: "website", label: "Website" },
			{ key: "profile", label: "Profile URL" },
			{ key: "cv", label: "CV URL" },
			{ key: "education", label: "Education" },
			{ key: "publications", label: "Publications" },
		],
	},
];

export default function ChangeRequestModal({
	onSubmit,
	onCancel,
}: {
	onSubmit: (changes: Record<string, string | number | null>) => void;
	onCancel: () => void;
}) {
	const [form, setForm] = useState<Record<string, string>>({});
	const [isVisible, setIsVisible] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const backdropRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		requestAnimationFrame(() => setIsVisible(true));
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = ""; };
	}, []);

	const handleClose = () => {
		setIsVisible(false);
		setTimeout(onCancel, 200);
	};

	const onBackdropClick = (e: React.MouseEvent) => {
		if (e.target === backdropRef.current) handleClose();
	};

	const handleSubmit = async () => {
		const changes: Record<string, string | number | null> = {};
		for (const [key, value] of Object.entries(form)) {
			const trimmed = value.trim();
			if (trimmed === "") continue;

			const isNumber = FIELD_SECTIONS
				.flatMap(s => s.fields)
				.find(f => f.key === key)?.type === "number";
			changes[key] = isNumber ? parseInt(trimmed) || trimmed : trimmed;
		}

		if (Object.keys(changes).length === 0) return;

		setSubmitting(true);
		setError("");
		try {
			await onSubmit(changes);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to submit request");
		}
		setSubmitting(false);
	};

	const filledCount = Object.values(form).filter(v => v.trim() !== "").length;

	return (
		<div
			ref={backdropRef}
			className={`${styles.backdrop} ${isVisible ? styles.visible : ""}`}
			onClick={onBackdropClick}
		>
			<div className={`${styles.modal} ${isVisible ? styles.visible : ""}`}>
				<button className={styles.close_button} onClick={handleClose}>
					<FontAwesomeIcon icon={faXmark} />
				</button>

				<h2 className={styles.title}>Request Info Update</h2>
				<p className={styles.subtitle}>
					Fill in only the fields you want to change. Leave the rest blank.
					Your request will be reviewed by an admin.
				</p>

				<div className={styles.sections}>
					{FIELD_SECTIONS.map(section => (
						<div key={section.label} className={styles.section}>
							<h3 className={styles.section_label}>{section.label}</h3>
							<div className={styles.fields}>
								{section.fields.map(field => (
									<div key={field.key} className={styles.field}>
										<label className={styles.field_label}>{field.label}</label>
										<Input
											placeholder={field.label}
											value={form[field.key] || ""}
											onChange={e => setForm(prev => ({
												...prev,
												[field.key]: e.target.value,
											}))}
										/>
									</div>
								))}
							</div>
						</div>
					))}
				</div>

				{error && (
					<div className={styles.error}>{error}</div>
				)}

				<div className={styles.actions}>
					<Button onClick={handleSubmit} disabled={submitting || filledCount === 0}>
						{submitting ? "Submitting..." : `Submit Request${filledCount > 0 ? ` (${filledCount} field${filledCount !== 1 ? "s" : ""})` : ""}`}
					</Button>
					<Button variant="secondary" onClick={handleClose}>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	);
}
