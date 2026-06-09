"use client";
import { API_URL } from "@/consts";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Post } from "@/lib/communityTypes";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import PostModal from "@/components/PostModal";
import Button from "@/components/Button";
import styles from "./myposts.module.scss";
import { API } from "yalies-shared";

export default function MyPostsPage() {
	const router = useRouter();
	const [posts, setPosts] = useState<Post[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedPost, setSelectedPost] = useState<Post | null>(null);
	const [currentNetid, setCurrentNetid] = useState("");

	const fetchMyPosts = useCallback(async () => {
		setIsLoading(true);
		try {
			const res = await fetch(`${API_URL}${API.communityMine}`, {
				credentials: "include",
			});
			if(!res.ok) {
				if(res.status === 401) {
					window.location.href = API_URL + API.login;
					return;
				}
				console.error("Error fetching posts");
				setIsLoading(false);
				return;
			}
			const data: Post[] = await res.json();
			setPosts(data);
			if(data.length > 0) {
				setCurrentNetid(data[0].author_netid);
			}
		} catch(e) {
			console.error(e);
		}
		setIsLoading(false);
	}, []);

	useEffect(() => {
		fetchMyPosts();
	}, [fetchMyPosts]);

	const updatePostStatus = async (postId: number, status: string) => {
		try {
			const res = await fetch(`${API_URL}${API.communityPost(postId)}`, {
				method: "PUT",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status }),
			});
			if(res.ok) {
				fetchMyPosts();
			}
		} catch(e) {
			console.error(e);
		}
	};

	const deletePost = async (postId: number) => {
		if(!confirm("Are you sure you want to delete this post?")) return;
		try {
			const res = await fetch(`${API_URL}${API.communityPost(postId)}`, {
				method: "DELETE",
				credentials: "include",
			});
			if(res.ok) {
				fetchMyPosts();
				setSelectedPost(null);
			}
		} catch(e) {
			console.error(e);
		}
	};

	const openPosts = posts.filter(p => p.status === "open");
	const closedPosts = posts.filter(p => p.status !== "open");

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>

			<div className={styles.my_posts_page}>
				<div className={styles.header}>
					<h1>My Posts</h1>
					<Button onClick={() => router.push("/community/create")}>
						New Post
					</Button>
				</div>

				{openPosts.length > 0 && (
					<div className={styles.section}>
						<h2>Active ({openPosts.length})</h2>
						<div className={styles.post_list}>
							{openPosts.map(post => (
								<div key={post.id} className={styles.post_item}>
									<div className={styles.post_info} onClick={() => setSelectedPost(post)}>
										<h3>{post.title}</h3>
										<span className={styles.meta}>
											{post.members?.length || 0} members &middot; {post.interest_count || 0} interested
										</span>
									</div>
									<div className={styles.post_actions}>
										<Button variant="secondary" onClick={() => updatePostStatus(post.id, "closed")}>
											Close
										</Button>
										<Button variant="destructive" onClick={() => deletePost(post.id)}>
											Delete
										</Button>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{closedPosts.length > 0 && (
					<div className={styles.section}>
						<h2>Closed ({closedPosts.length})</h2>
						<div className={styles.post_list}>
							{closedPosts.map(post => (
								<div key={post.id} className={styles.post_item}>
									<div className={styles.post_info} onClick={() => setSelectedPost(post)}>
										<h3>{post.title}</h3>
										<span className={styles.meta}>
											{post.members?.length || 0} members &middot; {post.status}
										</span>
									</div>
									<div className={styles.post_actions}>
										<Button variant="secondary" onClick={() => updatePostStatus(post.id, "open")}>
											Reopen
										</Button>
										<Button variant="destructive" onClick={() => deletePost(post.id)}>
											Delete
										</Button>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{!isLoading && posts.length === 0 && (
					<div className={styles.empty}>
						<p>You haven&apos;t created any posts yet.</p>
						<Button onClick={() => router.push("/community/create")}>
							Create your first post
						</Button>
					</div>
				)}
			</div>

			{selectedPost && (
				<PostModal
					post={selectedPost}
					onClose={() => setSelectedPost(null)}
					currentNetid={currentNetid}
				/>
			)}
		</>
	);
}
