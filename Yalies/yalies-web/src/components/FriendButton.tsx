"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserPlus, faUserCheck, faUserClock, faUserXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./friendbutton.module.scss";

type FriendStatus = "none" | "pending_sent" | "pending_received" | "accepted";

export default function FriendButton({
	netid,
}: {
	netid: string;
}) {
	const [status, setStatus] = useState<FriendStatus>("none");
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchStatus = async () => {
			try {
				const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/status/${netid}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				});
				if(response.ok) {
					const data = await response.json();
					setStatus(data.status);
					setCount(data.count);
				}
			} catch(e) {
				console.error(e);
			} finally {
				setLoading(false);
			}
		};
		fetchStatus();
	}, [netid]);

	const sendRequest = async () => {
		if(loading) return;
		setStatus("pending_sent");

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/request/${netid}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
				setCount(data.count);
			} else {
				setStatus("none");
			}
		} catch(e) {
			console.error(e);
			setStatus("none");
		}
	};

	const acceptRequest = async () => {
		if(loading) return;
		setStatus("accepted");
		setCount(prev => prev + 1);

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/accept/${netid}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
				setCount(data.count);
			} else {
				setStatus("pending_received");
				setCount(prev => prev - 1);
			}
		} catch(e) {
			console.error(e);
			setStatus("pending_received");
			setCount(prev => prev - 1);
		}
	};

	const declineRequest = async () => {
		if(loading) return;
		setStatus("none");

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/decline/${netid}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
				setCount(data.count);
			} else {
				setStatus("pending_received");
			}
		} catch(e) {
			console.error(e);
			setStatus("pending_received");
		}
	};

	const removeFriend = async () => {
		if(loading) return;
		setStatus("none");
		setCount(prev => prev - 1);

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/friends/${netid}`, {
				method: "DELETE",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
				setCount(data.count);
			} else {
				setStatus("accepted");
				setCount(prev => prev + 1);
			}
		} catch(e) {
			console.error(e);
			setStatus("accepted");
			setCount(prev => prev + 1);
		}
	};

	if(status === "pending_received") {
		return (
			<div className={styles.friend_container}>
				<div className={styles.request_actions}>
					<button className={`${styles.friend_button} ${styles.accept}`} onClick={acceptRequest} disabled={loading}>
						<FontAwesomeIcon icon={faUserCheck} className={styles.icon} />
						<span>Accept</span>
					</button>
					<button className={`${styles.friend_button} ${styles.decline}`} onClick={declineRequest} disabled={loading}>
						<FontAwesomeIcon icon={faUserXmark} className={styles.icon} />
						<span>Decline</span>
					</button>
				</div>
				<span className={styles.count}>{count} {count === 1 ? "friend" : "friends"}</span>
			</div>
		);
	}

	const getButtonContent = () => {
		switch(status) {
			case "none":
				return { icon: faUserPlus, text: "Add Friend", onClick: sendRequest, className: "" };
			case "pending_sent":
				return { icon: faUserClock, text: "Requested", onClick: () => {}, className: styles.pending };
			case "accepted":
				return { icon: faUserCheck, text: "Friends", onClick: removeFriend, className: styles.accepted };
		}
	};

	const btn = getButtonContent();

	return (
		<div className={styles.friend_container}>
			<button
				className={`${styles.friend_button} ${btn.className}`}
				onClick={btn.onClick}
				disabled={loading}
			>
				<FontAwesomeIcon icon={btn.icon} className={styles.icon} />
				<span>{btn.text}</span>
			</button>
			<span className={styles.count}>{count} {count === 1 ? "friend" : "friends"}</span>
		</div>
	);
}
