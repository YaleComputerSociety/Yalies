"use client";
import { API_URL, COLLEGE_SHIELDS } from "@/consts";

import styles from "./profile.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { Person, UserProfile, API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faGraduationCap, faBook, faHouse, faBuilding, faUser, faGear, faTrash, faPen, faCamera, faCloudArrowUp, faXmark } from "@fortawesome/free-solid-svg-icons";
import { faInstagram, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { useRouter } from "next/navigation";
import { getProfile, invalidateProfileCache, type PendingPhotoRequest } from "@/hooks/useProfileCache";
import ChangeRequestModal from "@/components/ChangeRequestModal";
import EmailCopyButton from "@/components/EmailCopyButton";
import { getSocialUrlError, normalizeSocialUrl } from "@/utils/externalUrl";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function ProfilePage() {
	const router = useRouter();
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [person, setPerson] = useState<Person | null>(null);
	const [linkedinUrl, setLinkedinUrl] = useState("");
	const [instagramUrl, setInstagramUrl] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [saveMessage, setSaveMessage] = useState("");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [deleteStep, setDeleteStep] = useState(0);
	const [showDataChangeBanner, setShowDataChangeBanner] = useState(false);
	const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
	const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState("");
	const [photoUploading, setPhotoUploading] = useState(false);
	const [photoMessage, setPhotoMessage] = useState("");
	const [photoRequest, setPhotoRequest] = useState<PendingPhotoRequest | null>(null);
	const settingsRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const applyProfileData = (
		data: UserProfile,
		personData: Person | null,
		pendingPhotoRequest: PendingPhotoRequest | null,
	) => {
		setProfile(data);
		setLinkedinUrl(data.linkedin_url ?? "");
		setInstagramUrl(data.instagram_url ?? "");
		if(personData) {
			setPerson(personData);
		}
		setPhotoRequest(pendingPhotoRequest);
	};

	const fetchProfile = async () => {
		try {
			const cached = await getProfile();
			if(cached) {
				applyProfileData(cached.profile, cached.person, cached.photoRequest);
				return;
			}

			setUnauthenticated(true);
		} catch(e) {
			console.error(e);
		}
	};

	const saveProfile = async () => {
		setIsSaving(true);
		setSaveMessage("");
		const normalizedLinkedinUrl = normalizeSocialUrl("linkedin", linkedinUrl);
		const normalizedInstagramUrl = normalizeSocialUrl("instagram", instagramUrl);

		if(normalizedLinkedinUrl === null) {
			setSaveMessage("LinkedIn URL must be on linkedin.com.");
			setIsSaving(false);
			return;
		}
		if(normalizedInstagramUrl === null) {
			setSaveMessage("Instagram URL must be on instagram.com.");
			setIsSaving(false);
			return;
		}

		let response;
		try {
			response = await fetch(`${API_URL}${API.profileMe}`, {
				method: "PUT",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					linkedin_url: normalizedLinkedinUrl || null,
					instagram_url: normalizedInstagramUrl || null,
				}),
			});
		} catch(e) {
			console.error(e);
			setSaveMessage("Failed to save profile.");
			setIsSaving(false);
			return;
		}
		if(!response || !response.ok) {
			const errorText = response ? await response.text() : "";
			console.error("Error saving profile", errorText);
			setSaveMessage(errorText || "Failed to save profile.");
			setIsSaving(false);
			return;
		}
		const data: UserProfile = await response.json();
		setProfile(data);
		setLinkedinUrl(data.linkedin_url ?? "");
		setInstagramUrl(data.instagram_url ?? "");
		invalidateProfileCache();
		setSaveMessage("Profile saved!");
		setIsSaving(false);
	};

	const linkedinHref = normalizeSocialUrl("linkedin", linkedinUrl) || "";
	const instagramHref = normalizeSocialUrl("instagram", instagramUrl) || "";
	const linkedinError = getSocialUrlError("linkedin", linkedinUrl);
	const instagramError = getSocialUrlError("instagram", instagramUrl);

	useEffect(() => {
		fetchProfile();
	}, []);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if(settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
				setSettingsOpen(false);
				setDeleteStep(0);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleRequestDataChange = () => {
		setSettingsOpen(false);
		setShowChangeRequestModal(true);
	};

	const handleSubmitChangeRequest = async (changes: Record<string, string | number | null>) => {
		const response = await fetch(
			`${API_URL}${API.profileMeChangeRequest}`,
			{
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ requested_changes: changes }),
			},
		);
		if(!response.ok) {
			const text = await response.text();
			throw new Error(text || `Error ${response.status}`);
		}
		setShowChangeRequestModal(false);
		setShowDataChangeBanner(true);
		setTimeout(() => setShowDataChangeBanner(false), 3000);
	};

	const handleDeleteClick = async () => {
		if(deleteStep === 0) {
			setDeleteStep(1);
			return;
		}
		if(deleteStep === 1) {
			setDeleteStep(2);
			return;
		}
		try {
			const response = await fetch(`${API_URL}${API.profileMe}`, {
				method: "DELETE",
				credentials: "include",
			});
			if(response.ok) {
				invalidateProfileCache();
				router.push("/");
			}
		} catch(e) {
			console.error(e);
		}
	};

	const clearSelectedPhoto = () => {
		if(photoPreview) URL.revokeObjectURL(photoPreview);
		setSelectedPhoto(null);
		setPhotoPreview("");
		if(fileInputRef.current) fileInputRef.current.value = "";
	};

	const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if(!file) return;
		setPhotoMessage("");
		if(!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
			setPhotoMessage("Choose a JPEG, PNG, or WebP image.");
			event.target.value = "";
			return;
		}
		if(file.size > 5 * 1024 * 1024) {
			setPhotoMessage("Photo must be under 5MB.");
			event.target.value = "";
			return;
		}
		if(photoPreview) URL.revokeObjectURL(photoPreview);
		setSelectedPhoto(file);
		setPhotoPreview(URL.createObjectURL(file));
	};

	const submitPhoto = async () => {
		if(!selectedPhoto || photoUploading) return;
		setPhotoUploading(true);
		setPhotoMessage("");
		const formData = new FormData();
		formData.append("photo", selectedPhoto);

		try {
			const response = await fetch(`${API_URL}${API.profileMePhoto}`, {
				method: "POST",
				credentials: "include",
				body: formData,
			});
			const contentType = response.headers.get("content-type") || "";
			const result = contentType.includes("application/json")
				? await response.json()
				: { error: await response.text() };
			if(!response.ok) throw new Error(result.error || "Could not submit your photo.");

			setPhotoRequest({
				id: result.request.id,
				status: "pending",
				created_at: result.request.created_at,
				preview_image: result.preview_image,
			});
			clearSelectedPhoto();
			invalidateProfileCache();
			setPhotoMessage("Photo submitted for admin review.");
		} catch(error) {
			setPhotoMessage(error instanceof Error ? error.message : "Could not submit your photo.");
		} finally {
			setPhotoUploading(false);
		}
	};

	if(isUnauthenticated) {
		return (
			<>
				<Topbar>
					<Navbar />
				</Topbar>
				<div id={styles.profile_page} className={logoFont.className}>
					<p>Please sign in to view your profile.</p>
				</div>
			</>
		);
	}

	const displayName = person
		? `${person.preferred_name || person.first_name} ${person.last_name}`
		: profile?.netid ?? "";
	const hasContactRow = person?.email || linkedinHref || instagramHref;

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>
			<div id={styles.profile_page} className={logoFont.className}>
				{showDataChangeBanner && (
					<div className={styles.banner}>Your change request has been submitted!</div>
				)}
				{showChangeRequestModal && (
					<ChangeRequestModal
						onSubmit={handleSubmitChangeRequest}
						onCancel={() => setShowChangeRequestModal(false)}
					/>
				)}

				<div className={styles.person_card}>
					<div className={styles.settings_container} ref={settingsRef}>
						<button
							className={styles.settings_button}
							onClick={() => { setSettingsOpen(!settingsOpen); setDeleteStep(0); }}
						>
							<FontAwesomeIcon icon={faGear} />
						</button>
						{settingsOpen && (
							<div className={styles.settings_dropdown}>
								<button
									className={styles.data_change_button}
									onClick={handleRequestDataChange}
								>
									<FontAwesomeIcon icon={faPen} />
									<span>Request Info Update</span>
								</button>
								<button
									className={styles.delete_button}
									onClick={handleDeleteClick}
								>
									<FontAwesomeIcon icon={faTrash} />
									{deleteStep === 0 && <span>Delete Profile</span>}
									{deleteStep === 1 && <span>Are you sure?</span>}
									{deleteStep === 2 && <span>Click again to confirm</span>}
								</button>
							</div>
						)}
					</div>

					<div className={styles.card_header}>
						<div className={styles.photo_section}>
							{photoPreview || person?.image ? (
								<img
									className={styles.profile_image}
									src={photoPreview || person?.image || ""}
									alt={displayName}
								/>
							) : (
								<div className={styles.photo_placeholder}>
									<FontAwesomeIcon icon={faUser} />
								</div>
							)}
							<button
								type="button"
								className={styles.photo_edit_button}
								onClick={() => fileInputRef.current?.click()}
								disabled={photoUploading || !!photoRequest}
								aria-label={photoRequest ? "Photo awaiting review" : "Choose a new profile photo"}
							>
								<FontAwesomeIcon icon={faCamera} />
								<span>{photoRequest ? "Pending" : "Change"}</span>
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								onChange={handlePhotoSelect}
								className={styles.photo_file_input}
							/>
						</div>
						<div className={styles.person_details}>
							<div className={styles.name_block}>
								<span className={styles.person_name}>{displayName}</span>
								{person?.pronouns && (
									<span className={styles.pronouns}>{person.pronouns}</span>
								)}
							</div>
							<div className={styles.info_rows}>
								{person?.college && (
									<div className={styles.info_row}>
										{person.college_code && COLLEGE_SHIELDS[person.college_code] ? (
											<img
												src={COLLEGE_SHIELDS[person.college_code]}
												alt={person.college_code}
												className={styles.college_shield}
											/>
										) : (
											<FontAwesomeIcon icon={faBuilding} />
										)}
										<span>{person.college}</span>
									</div>
								)}
								{person?.year && (
									<div className={styles.info_row}>
										<FontAwesomeIcon icon={faGraduationCap} />
										<span>Class of {person.year}</span>
									</div>
								)}
								{person?.school && (
									<div className={styles.info_row}>
										<FontAwesomeIcon icon={faBuilding} />
										<span>{person.school}</span>
									</div>
								)}
								{person?.major && (
									<div className={styles.info_row}>
										<FontAwesomeIcon icon={faBook} />
										<span>{person.major}</span>
									</div>
								)}
								{person?.address && (
									<div className={styles.info_row}>
										<FontAwesomeIcon icon={faHouse} />
										<span>{person.address}</span>
									</div>
								)}
							</div>
						</div>
					</div>
					{selectedPhoto && (
						<div className={styles.photo_confirmation}>
							<div>
								<strong>Submit this photo?</strong>
								<span>An admin will review it before it replaces your current picture.</span>
							</div>
							<div className={styles.photo_confirmation_actions}>
								<button type="button" onClick={clearSelectedPhoto} disabled={photoUploading}>
									<FontAwesomeIcon icon={faXmark} /> Cancel
								</button>
								<button type="button" className={styles.photo_submit_button} onClick={submitPhoto} disabled={photoUploading}>
									<FontAwesomeIcon icon={faCloudArrowUp} />
									{photoUploading ? "Submitting…" : "Submit for review"}
								</button>
							</div>
						</div>
					)}
					{photoRequest && !selectedPhoto && (
						<div className={styles.photo_pending_notice}>
							<img src={photoRequest.preview_image} alt="Pending profile photo" />
							<div>
								<strong>Photo awaiting review</strong>
								<span>Your current photo will stay visible until an admin approves this one.</span>
							</div>
						</div>
					)}
					{photoMessage && <div className={styles.photo_message} role="status">{photoMessage}</div>}
					{hasContactRow && (
						<div className={styles.contact_section}>
							{person?.email && (
								<EmailCopyButton className={styles.contact_email} email={person.email} />
							)}
							<div className={styles.contact_socials}>
								{linkedinHref && (
									<a href={linkedinHref} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
										<FontAwesomeIcon icon={faLinkedin as IconProp} />
									</a>
								)}
								{instagramHref && (
									<a href={instagramHref} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
										<FontAwesomeIcon icon={faInstagram as IconProp} />
									</a>
								)}
							</div>
						</div>
					)}
				</div>

				<h2>Social Links</h2>
				<div className={styles.field}>
					<label>LinkedIn URL</label>
					<Input
						placeholder="https://linkedin.com/in/yourname"
						value={linkedinUrl}
						onChange={e => setLinkedinUrl(e.target.value)}
					/>
					{linkedinError && <span className={styles.field_error}>{linkedinError}</span>}
				</div>
				<div className={styles.field}>
					<label>Instagram URL</label>
					<Input
						placeholder="https://instagram.com/yourhandle"
						value={instagramUrl}
						onChange={e => setInstagramUrl(e.target.value)}
					/>
					{instagramError && <span className={styles.field_error}>{instagramError}</span>}
				</div>

				<div className={styles.save_section}>
					<Button onClick={saveProfile}>{isSaving ? "Saving..." : "Save"}</Button>
					{saveMessage && <span className={styles.save_message}>{saveMessage}</span>}
				</div>

			</div>
		</>
	);
}
