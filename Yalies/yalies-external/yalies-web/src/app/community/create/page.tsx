"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import Chip from "@/components/Chip";
import { POST_TYPES, CATEGORIES, COMMON_TAGS } from "@/lib/communityTypes";
import { Person, API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./create.module.scss";

export default function CreatePostPage() {
	const router = useRouter();

	const [type, setType] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [customTag, setCustomTag] = useState("");
	const [competitionName, setCompetitionName] = useState("");
	const [competitionDate, setCompetitionDate] = useState("");
	const [competitionUrl, setCompetitionUrl] = useState("");
	const [spotsTotal, setSpotsTotal] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");

	const [teamMembers, setTeamMembers] = useState<Person[]>([]);
	const [memberSearch, setMemberSearch] = useState("");
	const [memberResults, setMemberResults] = useState<Person[]>([]);
	const [memberSearchLoading, setMemberSearchLoading] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const showCompetitionFields = category === "competition" || category === "hackathon";
	const showSpotsField = type === "team" || type === "recruiting";

	const toggleTag = (tag: string) => {
		if(selectedTags.includes(tag)) {
			setSelectedTags(selectedTags.filter(t => t !== tag));
		} else {
			setSelectedTags([...selectedTags, tag]);
		}
	};

	const addCustomTag = () => {
		const tag = customTag.trim();
		if(tag && !selectedTags.includes(tag)) {
			setSelectedTags([...selectedTags, tag]);
			setCustomTag("");
		}
	};

	const searchPeople = useCallback(async (query: string) => {
		if(query.trim().length < 2) {
			setMemberResults([]);
			setShowDropdown(false);
			return;
		}
		setMemberSearchLoading(true);
		try {
			const res = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: query.trim(),
					page: 0,
					page_size: 8,
				}),
			});
			if(res.ok) {
				const people: Person[] = await res.json();
				const selectedNetids = new Set(teamMembers.map(m => m.netid));
				setMemberResults(people.filter(p => p.netid && !selectedNetids.has(p.netid)));
				setShowDropdown(true);
			}
		} catch(e) {
			console.error(e);
		} finally {
			setMemberSearchLoading(false);
		}
	}, [teamMembers]);

	const handleMemberSearchChange = (value: string) => {
		setMemberSearch(value);
		if(searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
		if(value.trim().length < 2) {
			setMemberResults([]);
			setShowDropdown(false);
			return;
		}
		searchTimeoutRef.current = setTimeout(() => {
			searchPeople(value);
		}, 300);
	};

	const addMember = (person: Person) => {
		setTeamMembers(prev => [...prev, person]);
		setMemberSearch("");
		setMemberResults([]);
		setShowDropdown(false);
	};

	const removeMember = (netid: string) => {
		setTeamMembers(prev => prev.filter(m => m.netid !== netid));
	};

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if(dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setShowDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleSubmit = async () => {
		if(!type) { setError("Please select a post type"); return; }
		if(!title.trim()) { setError("Please enter a title"); return; }
		if(!category) { setError("Please select a category"); return; }

		setIsSubmitting(true);
		setError("");

		try {
			const res = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.community}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type,
					title: title.trim(),
					description: description.trim(),
					category,
					tags: selectedTags,
					...(competitionName && { competition_name: competitionName }),
					...(competitionDate && { competition_date: competitionDate }),
					...(competitionUrl && { competition_url: competitionUrl }),
					...(spotsTotal && { spots_total: parseInt(spotsTotal) }),
					...(teamMembers.length > 0 && { members: teamMembers.map(m => m.netid) }),
				}),
			});

			if(!res.ok) {
				if(res.status === 401) {
					window.location.href = process.env.NEXT_PUBLIC_YALIES_API_URL + API.login;
					return;
				}
				const text = await res.text();
				setError(text || "Failed to create post");
				setIsSubmitting(false);
				return;
			}

			router.push("/community");
		} catch(e) {
			console.error(e);
			setError("Failed to connect to server");
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>

			<div className={styles.create_page}>
				<h1>Create a Post</h1>

				<div className={styles.form}>
					<div className={styles.field}>
						<label>What kind of post is this?</label>
						<div className={styles.type_options}>
							{POST_TYPES.map(t => (
								<button
									key={t.value}
									className={`${styles.type_card} ${type === t.value ? styles.selected : ""}`}
									onClick={() => setType(t.value)}
								>
									<span className={styles.type_title}>{t.label}</span>
									<span className={styles.type_desc}>
										{t.value === "team" && "Find teammates for a specific event"}
										{t.value === "recruiting" && "You have a project and need help"}
										{t.value === "showcase" && "Share what you're working on"}
									</span>
								</button>
							))}
						</div>
					</div>

					<div className={styles.field}>
						<label>Title</label>
						<Input
							placeholder="e.g. Looking for ML engineer for YHack"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>

					<div className={styles.field}>
						<label>Description</label>
						<TextArea
							placeholder="Tell people about your project, what you're looking for, and why they should join..."
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={6}
						/>
					</div>

					<div className={styles.field}>
						<label>Category</label>
						<div className={styles.chip_options}>
							{CATEGORIES.map(c => (
								<Chip
									key={c.value}
									primary={category === c.value}
									onClick={() => setCategory(category === c.value ? "" : c.value)}
								>
									{c.label}
								</Chip>
							))}
						</div>
					</div>

					{showCompetitionFields && (
						<div className={styles.competition_fields}>
							<div className={styles.field}>
								<label>Competition Name</label>
								<Input
									placeholder="e.g. YHack 2026"
									value={competitionName}
									onChange={(e) => setCompetitionName(e.target.value)}
								/>
							</div>
							<div className={styles.field_row}>
								<div className={styles.field}>
									<label>Date</label>
									<input
										type="date"
										className={styles.date_input}
										value={competitionDate}
										onChange={(e) => setCompetitionDate(e.target.value)}
									/>
								</div>
								<div className={styles.field}>
									<label>Link</label>
									<Input
										placeholder="https://..."
										value={competitionUrl}
										onChange={(e) => setCompetitionUrl(e.target.value)}
									/>
								</div>
							</div>
						</div>
					)}

					{showSpotsField && (
						<div className={styles.field}>
							<label>Team Size (total spots including you)</label>
							<input
								type="number"
								className={styles.number_input}
								placeholder="e.g. 4"
								min={2}
								max={20}
								value={spotsTotal}
								onChange={(e) => setSpotsTotal(e.target.value)}
							/>
						</div>
					)}

					<div className={styles.field}>
						<label>Team Members</label>
						<span className={styles.field_hint}>Search and add people who are already on your team</span>
						<div className={styles.member_search_container} ref={dropdownRef}>
							<input
								type="text"
								className={styles.member_search_input}
								placeholder="Search by name..."
								value={memberSearch}
								onChange={(e) => handleMemberSearchChange(e.target.value)}
								onFocus={() => { if(memberResults.length > 0) setShowDropdown(true); }}
							/>
							{showDropdown && (
								<div className={styles.member_dropdown}>
									{memberSearchLoading && (
										<div className={styles.dropdown_loading}>Searching...</div>
									)}
									{!memberSearchLoading && memberResults.length === 0 && memberSearch.trim().length >= 2 && (
										<div className={styles.dropdown_empty}>No results found</div>
									)}
									{memberResults.map(person => (
										<button
											key={person.netid}
											className={styles.dropdown_item}
											onClick={() => addMember(person)}
										>
											<div className={styles.dropdown_photo}>
												{person.image ? (
													<img src={person.image} alt="" />
												) : (
													<div className={styles.dropdown_photo_placeholder}>
														<FontAwesomeIcon icon={faUser} />
													</div>
												)}
											</div>
											<div className={styles.dropdown_info}>
												<span className={styles.dropdown_name}>
													{person.preferred_name || person.first_name} {person.last_name}
												</span>
												<span className={styles.dropdown_detail}>
													{[person.college, person.year ? `'${String(person.year).slice(-2)}` : null].filter(Boolean).join(" · ") || person.netid}
												</span>
											</div>
										</button>
									))}
								</div>
							)}
						</div>
						{teamMembers.length > 0 && (
							<div className={styles.selected_members}>
								{teamMembers.map(person => (
									<div key={person.netid} className={styles.selected_member}>
										<div className={styles.selected_member_photo}>
											{person.image ? (
												<img src={person.image} alt="" />
											) : (
												<div className={styles.selected_member_photo_placeholder}>
													<FontAwesomeIcon icon={faUser} />
												</div>
											)}
										</div>
										<span className={styles.selected_member_name}>
											{person.preferred_name || person.first_name} {person.last_name}
										</span>
										<button
											className={styles.selected_member_remove}
											onClick={() => removeMember(person.netid!)}
										>
											<FontAwesomeIcon icon={faXmark} />
										</button>
									</div>
								))}
							</div>
						)}
					</div>

					<div className={styles.field}>
						<label>Skills & Topics</label>
						<div className={styles.chip_options}>
							{COMMON_TAGS.map(tag => (
								<Chip
									key={tag}
									primary={selectedTags.includes(tag)}
									onClick={() => toggleTag(tag)}
								>
									{tag}
								</Chip>
							))}
						</div>
						<div className={styles.custom_tag}>
							<Input
								placeholder="Add custom tag..."
								value={customTag}
								onChange={(e) => setCustomTag(e.target.value)}
								onSubmit={addCustomTag}
							/>
						</div>
						{selectedTags.filter(t => !COMMON_TAGS.includes(t)).length > 0 && (
							<div className={styles.custom_tags}>
								{selectedTags.filter(t => !COMMON_TAGS.includes(t)).map(tag => (
									<Chip
										key={tag}
										primary
										removable
										onRemove={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
									>
										{tag}
									</Chip>
								))}
							</div>
						)}
					</div>

					{error && <div className={styles.error}>{error}</div>}

					<div className={styles.actions}>
						<Button onClick={handleSubmit} disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create Post"}
						</Button>
						<Button variant="secondary" onClick={() => router.push("/community")}>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
