"use client";

import styles from "./profile.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { Person, UserProfile } from "../../../../yalies-shared/datatypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faGraduationCap, faBook, faHouse, faBuilding, faUser, faArrowLeft, faGear, faTrash, faPen, faUserGroup, faUserCheck, faUserXmark, faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

const COLLEGE_SHIELDS: Record<string, string> = {
	"BF": "/shields/BF.png",
	"BK": "/shields/BK.png",
	"BR": "/shields/BR.png",
	"DC": "/shields/DC.png",
	"ES": "/shields/ES.png",
	"GH": "/shields/GH.png",
	"JE": "/shields/JE.png",
	"MC": "/shields/MC.png",
	"MY": "/shields/MY.png",
	"PC": "/shields/PC.png",
	"SM": "/shields/SM.png",
	"SY": "/shields/SY.png",
	"TC": "/shields/TC.png",
	"TD": "/shields/TD.png",
};

export default function ProfilePage() {
	const router = useRouter();
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [person, setPerson] = useState<Person | null>(null);
	const [description, setDescription] = useState("");
	const [interestsInput, setInterestsInput] = useState("");
	const [linkedinUrl, setLinkedinUrl] = useState("");
	const [instagramUrl, setInstagramUrl] = useState("");
	const [classesInput, setClassesInput] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [saveMessage, setSaveMessage] = useState("");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [deleteStep, setDeleteStep] = useState(0);
	const [showDataChangeBanner, setShowDataChangeBanner] = useState(false);
	const [activeTab, setActiveTab] = useState<"about" | "friends">("about");
	const [friends, setFriends] = useState<Person[]>([]);
	const [friendRequests, setFriendRequests] = useState<Person[]>([]);
	const [friendsLoading, setFriendsLoading] = useState(false);
	const settingsRef = useRef<HTMLDivElement>(null);

	const fetchProfile = async () => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/profile/me`, {
				method: "GET",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
			});
		} catch(e) {
			console.error(e);
			return;
		}
		if(!response) {
			console.error("No response from server");
			return;
		}
		if(!response.ok) {
			if(response.status === 401) {
				setUnauthenticated(true);
				return;
			}
			if(response.status === 403) {
				window.location.href = "/forbidden";
				return;
			}
			console.error("Error fetching profile", response.status, response.statusText, await response.text());
			return;
		}
		const data: UserProfile = await response.json();
		setProfile(data);
		setDescription(data.description ?? "");
		setInterestsInput(data.interests?.join(", ") ?? "");
		setLinkedinUrl(data.linkedin_url ?? "");
		setInstagramUrl(data.instagram_url ?? "");
		setClassesInput(data.classes?.join(", ") ?? "");

		fetchPerson(data.netid);
	};

	const fetchPerson = async (netid: string) => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/people`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					filters: { netid: [netid] },
					page: 0,
					page_size: 1,
				}),
			});
		} catch(e) {
			console.error(e);
			return;
		}
		if(!response || !response.ok) {
			console.error("Error fetching person data");
			return;
		}
		const data: Person[] = await response.json();
		if(data.length > 0) {
			setPerson(data[0]);
		}
	};

	const saveProfile = async () => {
		setIsSaving(true);
		setSaveMessage("");

		const interests = interestsInput
			.split(",")
			.map(i => i.trim())
			.filter(i => i.length > 0);

		const classes = classesInput
			.split(",")
			.map(c => c.trim())
			.filter(c => c.length > 0);

		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/profile/me`, {
				method: "PUT",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					description: description || null,
					interests: interests.length > 0 ? interests : null,
					linkedin_url: linkedinUrl || null,
					instagram_url: instagramUrl || null,
					classes: classes.length > 0 ? classes : null,
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
		setSaveMessage("Profile saved!");
		setIsSaving(false);
	};

	const fetchPeopleByNetids = async (netids: string[]): Promise<Person[]> => {
		if(netids.length === 0) return [];
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/people`, {
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
				fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/me`, {
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/requests`, {
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
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/accept/${netid}`, {
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
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/decline/${netid}`, {
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
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/${netid}`, {
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
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/profile/me`, {
				method: "DELETE",
				credentials: "include",
			});
			if(response.ok) {
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
					<h1>Profile</h1>
					<p>Please sign in to view your profile.</p>
				</div>
			</>
		);
	}

	const displayName = person
		? `${person.preferred_name || person.first_name} ${person.last_name}`
		: profile?.netid ?? "";

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>
			<div id={styles.profile_page} className={logoFont.className}>
				<div className={styles.top_bar}>
					<button className={styles.back_button} onClick={() => router.back()}>
						<FontAwesomeIcon icon={faArrowLeft} />
						<span>Back</span>
					</button>
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
				</div>
				{showDataChangeBanner && (
					<div className={styles.banner}>Confirmed</div>
				)}
				<h1>Profile</h1>

				<div className={styles.person_card}>
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
					<div className={styles.person_info}>
						<h2 className={styles.person_name}>{displayName}</h2>
						{person?.pronouns && (
							<span className={styles.pronouns}>{person.pronouns}</span>
						)}
						<div className={styles.info_rows}>
							{person?.netid && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faUser} />
									<span>{person.netid}</span>
								</div>
							)}
							{person?.email && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faEnvelope} />
									<a href={`mailto:${person.email}`}>{person.email}</a>
								</div>
							)}
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
							{person?.major && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faBook} />
									<span>{person.major}</span>
								</div>
							)}
							{person?.school && (
								<div className={styles.info_row}>
									<FontAwesomeIcon icon={faBuilding} />
									<span>{person.school}</span>
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

				<div className={styles.tabs}>
					<button
						className={`${styles.tab} ${activeTab === "about" ? styles.active : ""}`}
						onClick={() => setActiveTab("about")}
					>
						About
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

				{activeTab === "about" && (
					<>
						<h2>About</h2>
						<div className={styles.field}>
							<label>Description</label>
							<textarea
								className={styles.textarea}
								placeholder="Tell people a bit about yourself..."
								value={description}
								onChange={e => setDescription(e.target.value)}
								rows={3}
							/>
						</div>
						<div className={styles.field}>
							<label>Interests</label>
							<Input
								placeholder="Photography, hiking, chess, ..."
								value={interestsInput}
								onChange={e => setInterestsInput(e.target.value)}
							/>
							<span className={styles.field_hint}>Separate interests with commas</span>
						</div>

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

						<h2>Classes</h2>
						<p>Enter your classes separated by commas.</p>
						<div className={styles.field}>
							<label>Classes</label>
							<Input
								placeholder="CPSC 201, MATH 225, ECON 115"
								value={classesInput}
								onChange={e => setClassesInput(e.target.value)}
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
													<span className={styles.friend_detail}>{p.college} &middot; '{String(p.year).slice(-2)}</span>
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
												<span className={styles.friend_detail}>{p.college} &middot; '{String(p.year).slice(-2)}</span>
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
							<p>No friends yet. Visit someone's profile and send them a friend request!</p>
						)}
					</div>
				)}
			</div>
		</>
	);
}
