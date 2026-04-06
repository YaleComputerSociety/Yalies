"use client";

import { useCallback, useEffect, useState } from "react";
import { Post } from "@/lib/communityTypes";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import Splash from "@/components/Splash";
import PostGrid from "@/components/PostGrid";
import PostModal from "@/components/PostModal";
import CommunityFilters, { CommunityFiltersToggle } from "@/components/CommunityFilters";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { useRouter } from "next/navigation";
import styles from "./community.module.scss";
import { API } from "yalies-shared";

export default function CommunityPage() {
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [currentNetid, setCurrentNetid] = useState<string>("");
	const [posts, setPosts] = useState<Post[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedPost, setSelectedPost] = useState<Post | null>(null);

	const [searchQuery, setSearchQuery] = useState("");
	const [activeQuery, setActiveQuery] = useState("");
	const [filterType, setFilterType] = useState("");
	const [filterCategory, setFilterCategory] = useState("");
	const [filterTags, setFilterTags] = useState<string[]>([]);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const router = useRouter();

	const fetchPosts = useCallback(async () => {
		setIsLoading(true);
		try {
			const res = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.communitySearch}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...(activeQuery && { query: activeQuery }),
					...(filterType && { type: filterType }),
					...(filterCategory && { category: filterCategory }),
					...(filterTags.length > 0 && { tags: filterTags }),
					page: 0,
					page_size: 50,
				}),
			});

			if(!res.ok) {
				if(res.status === 401) {
					setUnauthenticated(true);
					setIsLoading(false);
					return;
				}
				console.error("Error fetching posts", res.status);
				setIsLoading(false);
				return;
			}

			const data: Post[] = await res.json();
			setPosts(data);
		} catch(e) {
			console.error(e);
		}
		setIsLoading(false);
	}, [activeQuery, filterType, filterCategory, filterTags]);

	useEffect(() => {
		fetchPosts();
	}, [fetchPosts]);

	const onSearch = () => {
		setActiveQuery(searchQuery);
	};

	const activeFilterCount = (filterType ? 1 : 0) + (filterCategory ? 1 : 0) + filterTags.length;

	const resetFilters = () => {
		setFilterType("");
		setFilterCategory("");
		setFilterTags([]);
		setActiveQuery("");
		setSearchQuery("");
	};

	if(isUnauthenticated) {
		return (
			<>
				<Topbar>
					<Navbar />
				</Topbar>
				<Splash />
			</>
		);
	}

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>

			<div className={styles.search_bar}>
				<Input
					placeholder="Search posts..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onSubmit={onSearch}
				/>
				<CommunityFiltersToggle
					activeCount={activeFilterCount}
					open={filtersOpen}
					onToggle={() => setFiltersOpen(!filtersOpen)}
				/>
				<Button onClick={() => router.push("/community/create")}>
					New Post
				</Button>
			</div>

			<CommunityFilters
				type={filterType}
				category={filterCategory}
				tags={filterTags}
				onTypeChange={setFilterType}
				onCategoryChange={setFilterCategory}
				onTagsChange={setFilterTags}
				onReset={resetFilters}
				open={filtersOpen}
			/>

			<PostGrid
				posts={posts}
				onPostClick={setSelectedPost}
				isLoading={isLoading}
			/>

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
