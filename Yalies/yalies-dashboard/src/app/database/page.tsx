"use client";

import { useState, useEffect, useCallback } from "react";
import type {
	DatabaseOverview,
	DatabaseStudent,
	DatabaseStudentsResponse,
} from "@/lib/types";
import styles from "./database.module.scss";

const API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL ?? "";
const PAGE_SIZE = 50;

export default function DatabasePage() {
	const [overview, setOverview] = useState<DatabaseOverview | null>(null);
	const [students, setStudents] = useState<DatabaseStudent[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [tableLoading, setTableLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	const [collegeFilter, setCollegeFilter] = useState("");
	const [yearFilter, setYearFilter] = useState("");
	const [schoolFilter, setSchoolFilter] = useState("");

	const [activeTab, setActiveTab] = useState<"overview" | "students">(
		"overview"
	);

	const [editing, setEditing] = useState<DatabaseStudent | null>(null);
	const [deleting, setDeleting] = useState<DatabaseStudent | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const res = await fetch(`${API_URL}/api/database/overview`, { credentials: "include" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data: DatabaseOverview = await res.json();
				setOverview(data);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load overview."
				);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const fetchStudents = useCallback(
		async (p: number) => {
			setTableLoading(true);
			try {
				const params = new URLSearchParams({
					page: String(p),
					pageSize: String(PAGE_SIZE),
				});
				if (search) params.set("search", search);
				if (collegeFilter) params.set("college", collegeFilter);
				if (yearFilter) params.set("year", yearFilter);
				if (schoolFilter) params.set("school", schoolFilter);

				const res = await fetch(
					`${API_URL}/api/database/students?${params}`,
					{ credentials: "include" }
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data: DatabaseStudentsResponse = await res.json();
				setStudents(data.students);
				setTotal(data.total);
				setPage(data.page);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load students."
				);
			} finally {
				setTableLoading(false);
			}
		},
		[search, collegeFilter, yearFilter, schoolFilter]
	);

	useEffect(() => {
		if (activeTab === "students") {
			fetchStudents(1);
		}
	}, [activeTab, fetchStudents]);

	const handleSaveEdit = async (updated: DatabaseStudent) => {
		try {
			const res = await fetch(
				`${API_URL}/api/database/students/${updated.id}`,
				{
					method: "PUT",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						first_name: updated.first_name,
						last_name: updated.last_name,
						preferred_name: updated.preferred_name,
						middle_name: updated.middle_name,
						title: updated.title,
						suffix: updated.suffix,
						pronouns: updated.pronouns,
						phonetic_name: updated.phonetic_name,
						name_recording: updated.name_recording,
						netid: updated.netid,
						upi: updated.upi,
						email: updated.email,
						mailbox: updated.mailbox,
						phone: updated.phone,
						fax: updated.fax,
						school: updated.school,
						school_code: updated.school_code,
						year: updated.year,
						major: updated.major,
						college: updated.college,
						college_code: updated.college_code,
						curriculum: updated.curriculum,
						birthday: updated.birthday,
						birth_month: updated.birth_month,
						birth_day: updated.birth_day,
						address: updated.address,
						residence: updated.residence,
						access_code: updated.access_code,
						leave: updated.leave,
						visitor: updated.visitor,
						organization: updated.organization,
						organization_code: updated.organization_code,
						unit: updated.unit,
						unit_class: updated.unit_class,
						unit_code: updated.unit_code,
						postal_address: updated.postal_address,
						office_building: updated.office_building,
						office_room: updated.office_room,
						website: updated.website,
						profile: updated.profile,
						cv: updated.cv,
						education: updated.education,
						publications: updated.publications,
						linkedin_url: updated.linkedin_url,
						instagram_url: updated.instagram_url,
						classes: updated.classes,
					}),
				}
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const saved: DatabaseStudent = await res.json();
			setStudents((prev) =>
				prev.map((s) => (s.id === saved.id ? saved : s))
			);
			setEditing(null);
		} catch (err) {
			alert(
				err instanceof Error ? err.message : "Failed to save changes."
			);
		}
	};

	const handleDelete = async (student: DatabaseStudent) => {
		try {
			const res = await fetch(
				`${API_URL}/api/database/students/${student.id}`,
				{ method: "DELETE", credentials: "include" }
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			setStudents((prev) => prev.filter((s) => s.id !== student.id));
			setTotal((prev) => prev - 1);
			setDeleting(null);
		} catch (err) {
			alert(
				err instanceof Error
					? err.message
					: "Failed to delete student."
			);
		}
	};

	if (loading) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>Loading database...</div>
			</div>
		);
	}

	if (error && !overview) {
		return (
			<div className={styles.page}>
				<div className={styles.error}>{error}</div>
			</div>
		);
	}

	const totalPages = Math.ceil(total / PAGE_SIZE);

	return (
		<div className={styles.page}>
			<div className={styles.titleRow}>
				<h1 className={styles.title}>Database Explorer</h1>
				{overview && (
					<span className={styles.badge}>
						{overview.totalStudents.toLocaleString()} records
					</span>
				)}
			</div>

			<div className={styles.tabs}>
				<button
					className={`${styles.tab} ${activeTab === "overview" ? styles.tabActive : ""}`}
					onClick={() => setActiveTab("overview")}
				>
					Overview
				</button>
				<button
					className={`${styles.tab} ${activeTab === "students" ? styles.tabActive : ""}`}
					onClick={() => setActiveTab("students")}
				>
					Students
				</button>
			</div>

			{activeTab === "overview" && overview && (
				<div className={styles.overviewGrid}>
					<div className={styles.summaryRow}>
						<SummaryCard
							label="Total Students"
							value={overview.totalStudents}
						/>
						<SummaryCard
							label="Yale College"
							value={overview.ycStudents}
						/>
						<SummaryCard
							label="With NetID"
							value={overview.withNetid}
							percent={
								overview.totalStudents > 0
									? (overview.withNetid /
											overview.totalStudents) *
										100
									: 0
							}
						/>
						<SummaryCard
							label="With Email"
							value={overview.withEmail}
							percent={
								overview.totalStudents > 0
									? (overview.withEmail /
											overview.totalStudents) *
										100
									: 0
							}
						/>
						<SummaryCard
							label="With Photo"
							value={overview.withImage}
							percent={
								overview.totalStudents > 0
									? (overview.withImage /
											overview.totalStudents) *
										100
									: 0
							}
						/>
					</div>

					<div className={styles.card}>
						<h3 className={styles.cardTitle}>
							Class Year Distribution
						</h3>
						<div className={styles.barChart}>
							{overview.years.map((y) => {
								const max = Math.max(
									...overview.years.map((v) => v.count)
								);
								return (
									<div key={y.year} className={styles.barRow}>
										<span className={styles.barLabel}>
											{y.year}
										</span>
										<div className={styles.barTrack}>
											<div
												className={styles.barFill}
												style={{
													width: `${(y.count / max) * 100}%`,
												}}
											/>
										</div>
										<span className={styles.barValue}>
											{y.count.toLocaleString()}
										</span>
									</div>
								);
							})}
						</div>
					</div>

					<div className={styles.card}>
						<h3 className={styles.cardTitle}>
							Residential Colleges
						</h3>
						<div className={styles.collegeGrid}>
							{overview.colleges.map((c) => (
								<div key={c.name} className={styles.collegeItem}>
									<span className={styles.collegeName}>
										{c.name}
									</span>
									<span className={styles.collegeCount}>
										{c.count.toLocaleString()}
									</span>
								</div>
							))}
						</div>
					</div>

					{overview.schools.length > 1 && (
						<div className={styles.card}>
							<h3 className={styles.cardTitle}>Schools</h3>
							<div className={styles.barChart}>
								{overview.schools.map((s) => {
									const max = Math.max(
										...overview.schools.map((v) => v.count)
									);
									return (
										<div
											key={s.name}
											className={styles.barRow}
										>
											<span
												className={
													styles.barLabelWide
												}
											>
												{s.name}
											</span>
											<div className={styles.barTrack}>
												<div
													className={styles.barFill}
													style={{
														width: `${(s.count / max) * 100}%`,
													}}
												/>
											</div>
											<span className={styles.barValue}>
												{s.count.toLocaleString()}
											</span>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			)}

			{activeTab === "students" && (
				<div className={styles.studentsSection}>
					<div className={styles.filters}>
						<input
							className={styles.searchInput}
							type="text"
							placeholder="Search by name, netid, or email..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") fetchStudents(1);
							}}
						/>
						<select
							className={styles.filterSelect}
							value={collegeFilter}
							onChange={(e) => setCollegeFilter(e.target.value)}
						>
							<option value="">All Colleges</option>
							{overview?.colleges.map((c) => (
								<option key={c.name} value={c.name}>
									{c.name}
								</option>
							))}
						</select>
						<select
							className={styles.filterSelect}
							value={yearFilter}
							onChange={(e) => setYearFilter(e.target.value)}
						>
							<option value="">All Years</option>
							{overview?.years.map((y) => (
								<option key={y.year} value={String(y.year)}>
									{y.year}
								</option>
							))}
						</select>
						{overview && overview.schools.length > 1 && (
							<select
								className={styles.filterSelect}
								value={schoolFilter}
								onChange={(e) =>
									setSchoolFilter(e.target.value)
								}
							>
								<option value="">All Schools</option>
								{overview.schools.map((s) => (
									<option key={s.name} value={s.name}>
										{s.name}
									</option>
								))}
							</select>
						)}
						<button
							className={styles.searchBtn}
							onClick={() => fetchStudents(1)}
						>
							Search
						</button>
					</div>

					<div className={styles.resultsInfo}>
						{total.toLocaleString()} result
						{total !== 1 ? "s" : ""}
						{tableLoading && (
							<span className={styles.loadingDot}>
								{" "}
								Loading...
							</span>
						)}
					</div>

					<div className={styles.studentGrid}>
						{students.map((s) => (
							<StudentCard
								key={s.id}
								student={s}
								onEdit={() => setEditing({ ...s })}
								onDelete={() => setDeleting(s)}
							/>
						))}
					</div>

					{students.length === 0 && !tableLoading && (
						<div className={styles.empty}>
							No students match your search.
						</div>
					)}

					{totalPages > 1 && (
						<div className={styles.pagination}>
							<button
								className={styles.pageBtn}
								disabled={page <= 1}
								onClick={() => fetchStudents(page - 1)}
							>
								Previous
							</button>
							<span className={styles.pageInfo}>
								Page {page} of {totalPages}
							</span>
							<button
								className={styles.pageBtn}
								disabled={page >= totalPages}
								onClick={() => fetchStudents(page + 1)}
							>
								Next
							</button>
						</div>
					)}
				</div>
			)}

			{/* Edit Modal */}
			{editing && (
				<EditModal
					student={editing}
					onSave={handleSaveEdit}
					onCancel={() => setEditing(null)}
				/>
			)}

			{/* Delete Confirmation */}
			{deleting && (
				<DeleteModal
					student={deleting}
					onConfirm={() => handleDelete(deleting)}
					onCancel={() => setDeleting(null)}
				/>
			)}
		</div>
	);
}

/* ─── Sub-components ─── */

function SummaryCard({
	label,
	value,
	percent,
}: {
	label: string;
	value: number;
	percent?: number;
}) {
	return (
		<div className={styles.summaryCard}>
			<span className={styles.summaryLabel}>{label}</span>
			<span className={styles.summaryValue}>
				{value.toLocaleString()}
			</span>
			{percent !== undefined && (
				<span className={styles.summaryPercent}>
					{percent.toFixed(1)}%
				</span>
			)}
		</div>
	);
}

function StudentCard({
	student,
	onEdit,
	onDelete,
}: {
	student: DatabaseStudent;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const displayName = student.preferred_name
		? `${student.preferred_name} ${student.last_name}`
		: `${student.first_name} ${student.last_name}`;

	return (
		<div className={styles.studentCard}>
			<div className={styles.studentTop}>
				{student.image ? (
					<img
						className={styles.studentImg}
						src={student.image}
						alt={displayName}
					/>
				) : (
					<div className={styles.studentImgPlaceholder}>
						{(student.first_name?.[0] ?? "") +
							(student.last_name?.[0] ?? "")}
					</div>
				)}
				<div className={styles.studentInfo}>
					<span className={styles.studentName}>{displayName}</span>
					{student.pronouns && (
						<span className={styles.studentPronouns}>
							{student.pronouns}
						</span>
					)}
					{student.netid && (
						<span className={styles.studentNetid}>
							{student.netid}
						</span>
					)}
				</div>
				<div className={styles.cardActions}>
					<button
						className={styles.actionBtn}
						onClick={onEdit}
						title="Edit"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
					</button>
					<button
						className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
						onClick={onDelete}
						title="Delete"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="3 6 5 6 21 6" />
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</svg>
					</button>
				</div>
			</div>
			<div className={styles.studentDetails}>
				{student.email && <DetailRow label="Email" value={student.email} />}
				{student.mailbox && student.mailbox !== student.email && <DetailRow label="Mailbox" value={student.mailbox} />}
				{student.phone && <DetailRow label="Phone" value={student.phone} />}
				{student.fax && <DetailRow label="Fax" value={student.fax} />}
				{student.upi != null && <DetailRow label="UPI" value={String(student.upi)} />}
				{student.year && <DetailRow label="Year" value={String(student.year)} />}
				{student.college && <DetailRow label="College" value={`${student.college}${student.college_code ? ` (${student.college_code})` : ""}`} />}
				{student.school && <DetailRow label="School" value={`${student.school}${student.school_code ? ` (${student.school_code})` : ""}`} />}
				{student.major && <DetailRow label="Major" value={student.major} />}
				{student.curriculum && <DetailRow label="Curriculum" value={student.curriculum} />}
				{student.middle_name && <DetailRow label="Middle" value={student.middle_name} />}
				{student.suffix && <DetailRow label="Suffix" value={student.suffix} />}
				{student.title && <DetailRow label="Title" value={student.title} />}
				{(student.birth_month != null || student.birth_day != null || student.birthday) && (
					<DetailRow label="Birthday" value={student.birthday || `${student.birth_month ?? "?"}/${student.birth_day ?? "?"}`} />
				)}
				{student.address && <DetailRow label="Address" value={student.address.replace(/\n/g, ", ")} />}
				{student.residence && <DetailRow label="Residence" value={student.residence} />}
				{student.access_code && <DetailRow label="Access" value={student.access_code} />}
				{student.organization && <DetailRow label="Org" value={`${student.organization}${student.organization_code ? ` (${student.organization_code})` : ""}`} />}
				{student.unit && <DetailRow label="Unit" value={`${student.unit}${student.unit_class ? ` [${student.unit_class}]` : ""}${student.unit_code ? ` (${student.unit_code})` : ""}`} />}
				{student.postal_address && <DetailRow label="Postal" value={student.postal_address} />}
				{student.office_building && <DetailRow label="Office" value={`${student.office_building}${student.office_room ? ` ${student.office_room}` : ""}`} />}
				{student.education && <DetailRow label="Education" value={student.education} />}
				{student.website && <DetailRow label="Website" value={student.website} link />}
				{student.cv && <DetailRow label="CV" value={student.cv} link />}
				{student.profile && <DetailRow label="Profile" value={student.profile} link />}
				{student.publications && <DetailRow label="Pubs" value={student.publications} />}
				{student.linkedin_url && <DetailRow label="LinkedIn" value={student.linkedin_url} link />}
				{student.instagram_url && <DetailRow label="Insta" value={student.instagram_url} link />}
				{student.classes && student.classes.length > 0 && <DetailRow label="Classes" value={student.classes.join(", ")} />}
				{student.phonetic_name && <DetailRow label="Phonetic" value={student.phonetic_name} />}
				{student.name_recording && <DetailRow label="Recording" value={student.name_recording} link />}
				{student.leave && <DetailRow label="Status" value="On leave" />}
				{student.visitor && <DetailRow label="Status" value="Visitor" />}
			</div>
		</div>
	);
}

function DetailRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
	return (
		<div className={styles.detailRow}>
			<span className={styles.detailLabel}>{label}</span>
			{link ? (
				<a
					className={styles.detailLink}
					href={value.startsWith("http") ? value : `https://${value}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					{value.replace(/^https?:\/\/(www\.)?/, "")}
				</a>
			) : (
				<span className={styles.detailValue}>{value}</span>
			)}
		</div>
	);
}

function EditModal({
	student,
	onSave,
	onCancel,
}: {
	student: DatabaseStudent;
	onSave: (s: DatabaseStudent) => void;
	onCancel: () => void;
}) {
	const [form, setForm] = useState({ ...student });
	const [classesText, setClassesText] = useState(student.classes?.join(", ") ?? "");
	const [saving, setSaving] = useState(false);

	const set = (field: keyof DatabaseStudent, value: string | number | null) =>
		setForm((prev) => ({ ...prev, [field]: value }));

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		const classesArr = classesText.trim()
			? classesText.split(",").map((s) => s.trim()).filter(Boolean)
			: null;
		await onSave({ ...form, classes: classesArr });
		setSaving(false);
	};

	return (
		<div className={styles.overlay} onClick={onCancel}>
			<div
				className={styles.modalWide}
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className={styles.modalTitle}>Edit Student</h2>
				<form onSubmit={handleSubmit} className={styles.modalForm}>
					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Name</legend>
						<div className={styles.formRow}>
							<F label="First Name" value={form.first_name} onChange={(v) => set("first_name", v)} />
							<F label="Last Name" value={form.last_name} onChange={(v) => set("last_name", v)} />
						</div>
						<div className={styles.formRow}>
							<F label="Preferred Name" value={form.preferred_name ?? ""} onChange={(v) => set("preferred_name", v || null)} />
							<F label="Middle Name" value={form.middle_name ?? ""} onChange={(v) => set("middle_name", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Title" value={form.title ?? ""} onChange={(v) => set("title", v || null)} />
							<F label="Suffix" value={form.suffix ?? ""} onChange={(v) => set("suffix", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Pronouns" value={form.pronouns ?? ""} onChange={(v) => set("pronouns", v || null)} />
							<F label="Phonetic Name" value={form.phonetic_name ?? ""} onChange={(v) => set("phonetic_name", v || null)} />
						</div>
						<F label="Name Recording URL" value={form.name_recording ?? ""} onChange={(v) => set("name_recording", v || null)} />
					</fieldset>

					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Identifiers & Contact</legend>
						<div className={styles.formRow}>
							<F label="NetID" value={form.netid ?? ""} onChange={(v) => set("netid", v || null)} />
							<F label="UPI" value={form.upi != null ? String(form.upi) : ""} onChange={(v) => set("upi", v ? parseInt(v) || null : null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Email" value={form.email ?? ""} onChange={(v) => set("email", v || null)} />
							<F label="Mailbox" value={form.mailbox ?? ""} onChange={(v) => set("mailbox", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Phone" value={form.phone ?? ""} onChange={(v) => set("phone", v || null)} />
							<F label="Fax" value={form.fax ?? ""} onChange={(v) => set("fax", v || null)} />
						</div>
					</fieldset>

					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Academics</legend>
						<div className={styles.formRow}>
							<F label="School" value={form.school ?? ""} onChange={(v) => set("school", v || null)} />
							<F label="School Code" value={form.school_code ?? ""} onChange={(v) => set("school_code", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Year" value={form.year != null ? String(form.year) : ""} onChange={(v) => set("year", v ? parseInt(v) || null : null)} />
							<F label="Major" value={form.major ?? ""} onChange={(v) => set("major", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="College" value={form.college ?? ""} onChange={(v) => set("college", v || null)} />
							<F label="College Code" value={form.college_code ?? ""} onChange={(v) => set("college_code", v || null)} />
						</div>
						<F label="Curriculum" value={form.curriculum ?? ""} onChange={(v) => set("curriculum", v || null)} />
					</fieldset>

					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Personal</legend>
						<div className={styles.formRow}>
							<F label="Birthday (string)" value={form.birthday ?? ""} onChange={(v) => set("birthday", v || null)} />
							<F label="Birth Month" value={form.birth_month != null ? String(form.birth_month) : ""} onChange={(v) => set("birth_month", v ? parseInt(v) || null : null)} />
							<F label="Birth Day" value={form.birth_day != null ? String(form.birth_day) : ""} onChange={(v) => set("birth_day", v ? parseInt(v) || null : null)} />
						</div>
						<F label="Address" value={form.address ?? ""} onChange={(v) => set("address", v || null)} />
						<div className={styles.formRow}>
							<F label="Residence" value={form.residence ?? ""} onChange={(v) => set("residence", v || null)} />
							<F label="Access Code" value={form.access_code ?? ""} onChange={(v) => set("access_code", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Leave" value={form.leave ? "true" : ""} onChange={(v) => setForm((p) => ({ ...p, leave: v === "true" ? true : null }))} />
							<F label="Visitor" value={form.visitor ? "true" : ""} onChange={(v) => setForm((p) => ({ ...p, visitor: v === "true" ? true : null }))} />
						</div>
					</fieldset>

					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Organization / Staff</legend>
						<div className={styles.formRow}>
							<F label="Organization" value={form.organization ?? ""} onChange={(v) => set("organization", v || null)} />
							<F label="Org Code" value={form.organization_code ?? ""} onChange={(v) => set("organization_code", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="Unit" value={form.unit ?? ""} onChange={(v) => set("unit", v || null)} />
							<F label="Unit Class" value={form.unit_class ?? ""} onChange={(v) => set("unit_class", v || null)} />
							<F label="Unit Code" value={form.unit_code ?? ""} onChange={(v) => set("unit_code", v || null)} />
						</div>
						<F label="Postal Address" value={form.postal_address ?? ""} onChange={(v) => set("postal_address", v || null)} />
						<div className={styles.formRow}>
							<F label="Office Building" value={form.office_building ?? ""} onChange={(v) => set("office_building", v || null)} />
							<F label="Office Room" value={form.office_room ?? ""} onChange={(v) => set("office_room", v || null)} />
						</div>
					</fieldset>

					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Web & Publications</legend>
						<div className={styles.formRow}>
							<F label="Website" value={form.website ?? ""} onChange={(v) => set("website", v || null)} />
							<F label="Profile" value={form.profile ?? ""} onChange={(v) => set("profile", v || null)} />
						</div>
						<div className={styles.formRow}>
							<F label="CV" value={form.cv ?? ""} onChange={(v) => set("cv", v || null)} />
							<F label="Education" value={form.education ?? ""} onChange={(v) => set("education", v || null)} />
						</div>
						<F label="Publications" value={form.publications ?? ""} onChange={(v) => set("publications", v || null)} />
					</fieldset>

					<fieldset className={styles.formSection}>
						<legend className={styles.formLegend}>Socials & Classes</legend>
						<div className={styles.formRow}>
							<F label="LinkedIn URL" value={form.linkedin_url ?? ""} onChange={(v) => set("linkedin_url", v || null)} />
							<F label="Instagram URL" value={form.instagram_url ?? ""} onChange={(v) => set("instagram_url", v || null)} />
						</div>
						<F
							label="Classes (comma-separated)"
							value={classesText}
							onChange={(v) => setClassesText(v)}
						/>
					</fieldset>

					<div className={styles.modalActions}>
						<button type="button" className={styles.modalCancelBtn} onClick={onCancel}>Cancel</button>
						<button type="submit" className={styles.modalSaveBtn} disabled={saving}>
							{saving ? "Saving..." : "Save Changes"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

function F({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<label className={styles.fieldLabel}>
			<span className={styles.fieldLabelText}>{label}</span>
			<input
				className={styles.fieldInput}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</label>
	);
}

function DeleteModal({
	student,
	onConfirm,
	onCancel,
}: {
	student: DatabaseStudent;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const displayName = student.preferred_name
		? `${student.preferred_name} ${student.last_name}`
		: `${student.first_name} ${student.last_name}`;

	const handleConfirm = async () => {
		setConfirming(true);
		await onConfirm();
		setConfirming(false);
	};

	return (
		<div className={styles.overlay} onClick={onCancel}>
			<div
				className={styles.modal}
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className={styles.modalTitle}>Delete Student</h2>
				<p className={styles.deleteText}>
					Are you sure you want to delete{" "}
					<strong>{displayName}</strong>
					{student.netid ? ` (${student.netid})` : ""}? This action
					cannot be undone.
				</p>
				<div className={styles.modalActions}>
					<button
						className={styles.modalCancelBtn}
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						className={styles.modalDeleteBtn}
						onClick={handleConfirm}
						disabled={confirming}
					>
						{confirming ? "Deleting..." : "Delete"}
					</button>
				</div>
			</div>
		</div>
	);
}
