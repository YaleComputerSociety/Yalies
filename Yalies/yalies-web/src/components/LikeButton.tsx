"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart as faHeartSolid } from "@fortawesome/free-solid-svg-icons";
import { faHeart as faHeartOutline } from "@fortawesome/free-regular-svg-icons";
import styles from "./likebutton.module.scss";

export default function LikeButton({
	netid,
}: {
	netid: string;
}) {
	const [liked, setLiked] = useState(false);
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchLikes = async () => {
			try {
				const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/likes/${netid}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				});
				if(response.ok) {
					const data = await response.json();
					setLiked(data.liked);
					setCount(data.count);
				}
			} catch(e) {
				console.error(e);
			} finally {
				setLoading(false);
			}
		};
		fetchLikes();
	}, [netid]);

	const toggleLike = async () => {
		if(loading) return;

		const newLiked = !liked;
		setLiked(newLiked);
		setCount(prev => prev + (newLiked ? 1 : -1));

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/likes/${netid}`, {
				method: newLiked ? "POST" : "DELETE",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setLiked(data.liked);
				setCount(data.count);
			} else {
				setLiked(!newLiked);
				setCount(prev => prev + (newLiked ? -1 : 1));
			}
		} catch(e) {
			console.error(e);
			setLiked(!newLiked);
			setCount(prev => prev + (newLiked ? -1 : 1));
		}
	};

	return (
		<button className={styles.like_button} onClick={toggleLike} disabled={loading}>
			<FontAwesomeIcon
				icon={liked ? faHeartSolid : faHeartOutline}
				className={`${styles.heart} ${liked ? styles.liked : ""}`}
			/>
			<span className={styles.count}>{count}</span>
		</button>
	);
}
