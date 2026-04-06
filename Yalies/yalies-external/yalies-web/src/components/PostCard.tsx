"use client";

import { Post } from "@/lib/communityTypes";
import styles from "./postcard.module.scss";
import Chip from "./Chip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faHeart, faCalendar, faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

const TYPE_LABELS: Record<string, string> = {
	team: "Looking for Team",
	recruiting: "Recruiting",
	showcase: "Showcase",
};

const CATEGORY_LABELS: Record<string, string> = {
	competition: "Competition",
	hackathon: "Hackathon",
	startup: "Startup",
	research: "Research",
	club: "Club Project",
	side_project: "Side Project",
	class_project: "Class Project",
};

export default function PostCard({
	post,
	onClick,
}: {
	post: Post;
	onClick: () => void;
}) {
	const memberCount = post.members?.length || 0;
	const spotsLeft = post.spots_total ? post.spots_total - memberCount : null;

	return (
		<div className={styles.post_card} onClick={onClick}>
			<div className={styles.header}>
				<span className={`${styles.type_badge} ${styles[post.type]}`}>
					{TYPE_LABELS[post.type] || post.type}
				</span>
				<span className={styles.category}>
					{CATEGORY_LABELS[post.category] || post.category}
				</span>
			</div>

			<h3 className={styles.title}>{post.title}</h3>

			<p className={styles.description}>
				{post.description.length > 150
					? post.description.slice(0, 150) + "..."
					: post.description}
			</p>

			{post.tags.length > 0 && (
				<div className={styles.tags}>
					{post.tags.slice(0, 5).map(tag => (
						<Chip key={tag}>{tag}</Chip>
					))}
					{post.tags.length > 5 && (
						<Chip>+{post.tags.length - 5}</Chip>
					)}
				</div>
			)}

			{post.competition_name && (
				<div className={styles.competition_info}>
					<FontAwesomeIcon icon={faArrowUpRightFromSquare} />
					<span>{post.competition_name}</span>
					{post.competition_date && (
						<>
							<FontAwesomeIcon icon={faCalendar} />
							<span>{new Date(post.competition_date).toLocaleDateString()}</span>
						</>
					)}
				</div>
			)}

			<div className={styles.footer}>
				<div className={styles.meta}>
					<span className={styles.meta_item}>
						<FontAwesomeIcon icon={faUsers} />
						{memberCount}{spotsLeft !== null ? `/${post.spots_total}` : ""}
					</span>
					<span className={styles.meta_item}>
						<FontAwesomeIcon icon={faHeart} />
						{post.interest_count || 0}
					</span>
				</div>
				<span className={styles.author}>
					{post.author_netid}
				</span>
			</div>
		</div>
	);
}
