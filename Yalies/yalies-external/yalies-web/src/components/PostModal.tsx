"use client";
import { API_URL } from "@/consts";

import { Post, TYPE_LABELS, CATEGORY_LABELS } from "@/lib/communityTypes";
import styles from "./postmodal.module.scss";
import Chip from "./Chip";
import Button from "./Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	faXmark, faUsers, faHeart as faHeartSolid,
	faCalendar, faArrowUpRightFromSquare, faEnvelope, faPhone,
} from "@fortawesome/free-solid-svg-icons";
import { faHeart as faHeartRegular } from "@fortawesome/free-regular-svg-icons";
import { useCallback, useEffect, useState } from "react";
import { Person, API } from "yalies-shared";

export default function PostModal({
	post,
	onClose,
	currentNetid,
}: {
	post: Post;
	onClose: () => void;
	currentNetid?: string;
}) {
	const [isInterested, setIsInterested] = useState(post.is_interested || false);
	const [interestCount, setInterestCount] = useState(post.interest_count || 0);
	const members = post.members || [];
	const [showContact, setShowContact] = useState(false);
	const [authorPerson, setAuthorPerson] = useState<Person | null>(null);
	const [contactLoading, setContactLoading] = useState(false);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if(e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	const toggleInterest = useCallback(async () => {
		const method = isInterested ? "DELETE" : "POST";
		try {
			const res = await fetch(`${API_URL}${API.communityInterest(post.id)}`, {
				method,
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(res.ok) {
				const data = await res.json();
				setIsInterested(data.interested);
				setInterestCount(data.count);
			}
		} catch(e) {
			console.error(e);
		}
	}, [isInterested, post.id]);

	const handleContact = useCallback(async () => {
		if(showContact) {
			setShowContact(false);
			return;
		}
		if(authorPerson) {
			setShowContact(true);
			return;
		}
		setContactLoading(true);
		try {
			const res = await fetch(`${API_URL}${API.people}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					filters: { netid: [post.author_netid] },
					page: 0,
					page_size: 1,
				}),
			});
			if(res.ok) {
				const people: Person[] = await res.json();
				if(people.length > 0) {
					setAuthorPerson(people[0]);
				}
			}
		} catch(e) {
			console.error(e);
		} finally {
			setContactLoading(false);
			setShowContact(true);
		}
	}, [showContact, authorPerson, post.author_netid]);

	const memberCount = members.length;

	return (
		<div className={styles.backdrop} onClick={onClose}>
			<div className={styles.modal} onClick={e => e.stopPropagation()}>
				<button className={styles.close_button} onClick={onClose}>
					<FontAwesomeIcon icon={faXmark} />
				</button>

				<div className={styles.header}>
					<span className={`${styles.type_badge} ${styles[post.type]}`}>
						{TYPE_LABELS[post.type] || post.type}
					</span>
					<span className={styles.category}>
						{CATEGORY_LABELS[post.category] || post.category}
					</span>
					{post.status !== "open" && (
						<span className={styles.status_badge}>{post.status}</span>
					)}
				</div>

				<h2 className={styles.title}>{post.title}</h2>
				<p className={styles.author}>Posted by {post.author_netid} &middot; {new Date(post.created_at).toLocaleDateString()}</p>

				{post.competition_name && (
					<div className={styles.competition_section}>
						<h4>Competition</h4>
						<div className={styles.competition_details}>
							<span>{post.competition_name}</span>
							{post.competition_date && (
								<span>
									<FontAwesomeIcon icon={faCalendar} />
									{new Date(post.competition_date).toLocaleDateString()}
								</span>
							)}
							{post.competition_url && (
								<a href={post.competition_url} target="_blank" rel="noopener noreferrer">
									<FontAwesomeIcon icon={faArrowUpRightFromSquare} />
									Link
								</a>
							)}
						</div>
					</div>
				)}

				<div className={styles.description_section}>
					<h4>Description</h4>
					<p>{post.description}</p>
				</div>

				{post.tags.length > 0 && (
					<div className={styles.tags_section}>
						<h4>Skills & Topics</h4>
						<div className={styles.tags}>
							{post.tags.map(tag => (
								<Chip key={tag} primary>{tag}</Chip>
							))}
						</div>
					</div>
				)}

				<div className={styles.members_section}>
					<h4>
						<FontAwesomeIcon icon={faUsers} />
						Team ({memberCount}{post.spots_total ? `/${post.spots_total}` : ""})
					</h4>
					<div className={styles.members_list}>
						{members.map(member => (
							<div key={member.netid} className={styles.member}>
								<span className={styles.member_netid}>{member.netid}</span>
								{member.role === "creator" && (
									<span className={styles.creator_badge}>Creator</span>
								)}
							</div>
						))}
					</div>
				</div>

				<div className={styles.actions}>
					{post.author_netid !== currentNetid && (
						<Button onClick={handleContact}>
							{contactLoading ? "Loading..." : "Contact"}
						</Button>
					)}
					<button className={styles.interest_button} onClick={toggleInterest}>
						<FontAwesomeIcon icon={(isInterested ? faHeartSolid : faHeartRegular) as import("@fortawesome/fontawesome-svg-core").IconProp} />
						<span>{interestCount}</span>
					</button>
				</div>

				{showContact && (
					<div className={styles.contact_info}>
						{authorPerson?.email && (
							<div className={styles.contact_row}>
								<FontAwesomeIcon icon={faEnvelope} />
								<a href={`mailto:${authorPerson.email}`}>{authorPerson.email}</a>
							</div>
						)}
						{authorPerson?.phone && (
							<div className={styles.contact_row}>
								<FontAwesomeIcon icon={faPhone} />
								<a href={`tel:${authorPerson.phone}`}>{authorPerson.phone}</a>
							</div>
						)}
						{authorPerson && !authorPerson.email && !authorPerson.phone && (
							<p className={styles.no_contact}>No contact info available.</p>
						)}
						{!authorPerson && (
							<p className={styles.no_contact}>Could not find contact info.</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
