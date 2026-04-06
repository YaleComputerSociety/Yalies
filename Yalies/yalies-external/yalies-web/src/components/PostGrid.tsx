"use client";

import { Post } from "@/lib/communityTypes";
import styles from "./postgrid.module.scss";
import PostCard from "./PostCard";

export default function PostGrid({
	posts,
	onPostClick,
	isLoading,
	emptyMessage,
}: {
	posts: Post[];
	onPostClick: (post: Post) => void;
	isLoading?: boolean;
	emptyMessage?: string;
}) {
	if(isLoading) {
		return (
			<div className={styles.loading}>
				<div className={styles.spinner} />
			</div>
		);
	}

	if(posts.length === 0) {
		return (
			<div className={styles.empty}>
				<p>{emptyMessage || "No posts yet. Be the first to share something!"}</p>
			</div>
		);
	}

	return (
		<div className={styles.post_grid}>
			{posts.map(post => (
				<PostCard
					key={post.id}
					post={post}
					onClick={() => onPostClick(post)}
				/>
			))}
		</div>
	);
}
