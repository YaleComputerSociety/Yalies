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
import { faGraduationCap, faBook, faHouse, faBuilding, faUser, faGear, faTrash, faPen, faUserGroup, faUserCheck, faUserXmark, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { faInstagram, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { useRouter } from "next/navigation";
import { getProfile, invalidateProfileCache } from "@/hooks/useProfileCache";
import ChangeRequestModal from "@/components/ChangeRequestModal";
import EmailCopyButton from "@/components/EmailCopyButton";

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
	const [activeTab, setActiveTab] = useState<"profile" | "friends">("profile");
	const [friends, setFriends] = useState<Person[]>([]);
	const [friendRequests, setFriendRequests] = useState<Person[]>([]);
	const [friendsLoading, setFriendsLoading] = useState(false);
	const settingsRef = useRef<HTMLDivElement>(null);

	const applyProfileData = (data: UserProfile, personData: Person | null) => {
		setProfile(data);
		setLinkedinUrl(data.linkedin_url ?? "");
		setInstagramUrl(data.instagram_url ?? "");
		if(personData) {
			setPerson(personData);
		}
	};

	const fetchProfile = async () => {
		try {
			const cached = await getProfile();
			if(cached) {
				applyProfileData(cached.profile, cached.person);
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

		let response;
		try {
			response = await fetch(`${API_URL}${API.profileMe}`, {
				method: "PUT",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					linkedin_url: linkedinUrl || null,
					instagram_url: instagramUrl || null,
				}),
			});
		} catch(e) {
			console.error(e);
			setSaveMessage("Failed to save profile.");
			setIsSaving(false);
			return;
		}
		if(!response || !response.ok) {
			console.error("Error saving profile");
			setSaveMessage("Failed to save profile.");
			setIsSaving(false);
			return;
		}
		const data: UserProfile = await response.json();
		setProfile(data);
		invalidateProfileCache();
		setSaveMessage("Profile saved!");
		setIsSaving(false);
	};

	const fetchPeopleByNetids = async (netids: string[]): Promise<Person[]> => {
		if(netids.length === 0) return [];
		try {
			const response = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					filters: { netid: netids },
					page: 0,
					page_size: netids.length,
				}),
			});
			if(response?.ok) {
				return await response.json();
			}
		} catch(e) {
			console.error(e);
		}
		return [];
	};

	const fetchFriends = async () => {
		setFriendsLoading(true);
		try {
			const [friendsRes, requestsRes] = await Promise.all([
				fetch(`${API_URL}${API.friendsMe}`, {
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`${API_URL}${API.friendsRequests}`, {
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
			]);

			if(friendsRes.ok && requestsRes.ok) {
				const friendsData = await friendsRes.json();
				const requestsData = await requestsRes.json();

				const allNetids = [...friendsData.friends, ...requestsData.requests];
				const people = await fetchPeopleByNetids(allNetids);

				const personMap = new Map<string, Person>();
				people.forEach(p => { if(p.netid) personMap.set(p.netid, p); });

				setFriends(friendsData.friends.map((n: string) => personMap.get(n) || { first_name: n, last_name: "" }));
				setFriendRequests(requestsData.requests.map((n: string) => personMap.get(n) || { first_name: n, last_name: "" }));
			}
		} catch(e) {
			console.error(e);
		} finally {
			setFriendsLoading(false);
		}
	};

	const handleAcceptRequest = async (netid: string) => {
		try {
			const response = await fetch(`${API_URL}${API.friendsAccept(netid)}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const accepted = friendRequests.find(p => p.netid === netid);
				setFriendRequests(prev => prev.filter(p => p.netid !== netid));
				if(accepted) setFriends(prev => [...prev, accepted]);
			}
		} catch(e) {
			console.error(e);
		}
	};

	const handleDeclineRequest = async (netid: string) => {
		try {
			const response = await fetch(`${API_URL}${API.friendsDecline(netid)}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				setFriendRequests(prev => prev.filter(p => p.netid !== netid));
			}
		} catch(e) {
			console.error(e);
		}
	};

	const handleRemoveFriend = async (netid: string) => {
		try {
			const response = await fetch(`${API_URL}${API.friendsRemove(netid)}`, {
				method: "DELETE",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				setFriends(prev => prev.filter(p => p.netid !== netid));
			}
		} catch(e) {
			console.error(e);
		}
	};

	useEffect(() => {
		fetchProfile();
	}, []);

	useEffect(() => {
		if(activeTab === "friends") {
			fetchFriends();
		}
	}, [activeTab]);

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
	const hasContactRow = person?.email || linkedinUrl || instagramUrl;

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
							{person?.image ? (
								<img
									className={styles.profile_image}
									src={person.image}
									alt={displayName}
								/>
							) : (
								<div className={styles.photo_placeholder}>
									<FontAwesomeIcon icon={faUser} />
								</div>
							)}
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
					{hasContactRow && (
						<div className={styles.contact_section}>
							{person?.email && (
								<EmailCopyButton className={styles.contact_email} email={person.email} />
							)}
							<div className={styles.contact_socials}>
								{linkedinUrl && (
									<a href={linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
										<FontAwesomeIcon icon={faLinkedin as IconProp} />
									</a>
								)}
								{instagramUrl && (
									<a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
										<FontAwesomeIcon icon={faInstagram as IconProp} />
									</a>
								)}
							</div>
						</div>
					)}
				</div>

				<div className={styles.tabs}>
					<button
						className={`${styles.tab} ${activeTab === "profile" ? styles.active : ""}`}
						onClick={() => setActiveTab("profile")}
					>
						Profile
					</button>
					<button
						className={`${styles.tab} ${activeTab === "friends" ? styles.active : ""}`}
						onClick={() => setActiveTab("friends")}
					>
						<FontAwesomeIcon icon={faUserGroup} />
						Friends
						{friendRequests.length > 0 && (
							<span className={styles.badge}>{friendRequests.length}</span>
						)}
					</button>
				</div>

				{activeTab === "profile" && (
					<>
						<h2>Social Links</h2>
						<div className={styles.field}>
							<label>LinkedIn URL</label>
							<Input
								placeholder="https://linkedin.com/in/yourname"
								value={linkedinUrl}
								onChange={e => setLinkedinUrl(e.target.value)}
							/>
						</div>
						<div className={styles.field}>
							<label>Instagram URL</label>
							<Input
								placeholder="https://instagram.com/yourhandle"
								value={instagramUrl}
								onChange={e => setInstagramUrl(e.target.value)}
							/>
						</div>

						<div className={styles.save_section}>
							<Button onClick={saveProfile}>{isSaving ? "Saving..." : "Save"}</Button>
							{saveMessage && <span className={styles.save_message}>{saveMessage}</span>}
						</div>
					</>
				)}

				{activeTab === "friends" && (
					<div className={styles.friends_tab}>
						{friendRequests.length > 0 && (
							<>
								<h2>Friend Requests</h2>
								<div className={styles.friends_list}>
									{friendRequests.map(p => (
										<div key={p.netid} className={styles.friend_card}>
											<div className={styles.friend_photo}>
												{p.image ? (
													<img src={p.image} alt={`${p.first_name} ${p.last_name}`} />
												) : (
													<div className={styles.friend_photo_placeholder}>
														<FontAwesomeIcon icon={faUser} />
													</div>
												)}
											</div>
											<div className={styles.friend_info}>
												<span className={styles.friend_name}>
													{p.preferred_name || p.first_name} {p.last_name}
												</span>
												{p.college && p.year && (
													<span className={styles.friend_detail}>{p.college} &middot; &apos;{String(p.year).slice(-2)}</span>
												)}
											</div>
											<div className={styles.friend_actions}>
												<button
													className={`${styles.friend_action} ${styles.accept_action}`}
													onClick={() => p.netid && handleAcceptRequest(p.netid)}
												>
													<FontAwesomeIcon icon={faUserCheck} />
													Accept
												</button>
												<button
													className={`${styles.friend_action} ${styles.decline_action}`}
													onClick={() => p.netid && handleDeclineRequest(p.netid)}
												>
													<FontAwesomeIcon icon={faUserXmark} />
													Decline
												</button>
											</div>
										</div>
									))}
								</div>
							</>
						)}

						<h2>Friends{friends.length > 0 && ` (${friends.length})`}</h2>
						{friendsLoading ? (
							<p>Loading...</p>
						) : friends.length > 0 ? (
							<div className={styles.friends_list}>
								{friends.map(p => (
									<div key={p.netid} className={styles.friend_card}>
										<div className={styles.friend_photo}>
											{p.image ? (
												<img src={p.image} alt={`${p.first_name} ${p.last_name}`} />
											) : (
												<div className={styles.friend_photo_placeholder}>
													<FontAwesomeIcon icon={faUser} />
												</div>
											)}
										</div>
										<div className={styles.friend_info}>
											<span className={styles.friend_name}>
												{p.preferred_name || p.first_name} {p.last_name}
											</span>
											{p.college && p.year && (
												<span className={styles.friend_detail}>{p.college} &middot; &apos;{String(p.year).slice(-2)}</span>
											)}
										</div>
										<button
											className={`${styles.friend_action} ${styles.remove_action}`}
											onClick={() => p.netid && handleRemoveFriend(p.netid)}
										>
											<FontAwesomeIcon icon={faUserMinus} />
											Remove
										</button>
									</div>
								))}
							</div>
						) : (
							<p>No friends yet. Visit someone&apos;s profile and send them a friend request!</p>
						)}
					</div>
				)}

			</div>
		</>
	);
}
