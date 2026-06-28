"use client";
import { API_URL } from "@/consts";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserPlus, faUserCheck, faUserClock, faUserXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./friendbutton.module.scss";
import { API } from "yalies-shared";

type FriendStatus = "none" | "pending_sent" | "pending_received" | "accepted";

export default function FriendButton({
	netid,
	initialStatus,
}: {
	netid: string;
	initialStatus?: string;
	initialCount?: number;
}) {
	const hasInitialData = initialStatus !== undefined;
	const [status, setStatus] = useState<FriendStatus>((initialStatus as FriendStatus) ?? "none");
	const [loading, setLoading] = useState(!hasInitialData);

	useEffect(() => {
		if (hasInitialData) return;
		const fetchStatus = async () => {
			try {
				const response = await fetch(`${API_URL}${API.friendsStatus(netid)}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				});
				if(response.ok) {
					const data = await response.json();
					setStatus(data.status);
				}
			} catch(e) {
				console.error(e);
			} finally {
				setLoading(false);
			}
		};
		fetchStatus();
	}, [netid, hasInitialData]);

	const sendRequest = async () => {
		if(loading) return;
		setStatus("pending_sent");

		try {
			const response = await fetch(`${API_URL}${API.friendsRequest(netid)}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
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

		try {
			const response = await fetch(`${API_URL}${API.friendsAccept(netid)}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
			} else {
				setStatus("pending_received");
			}
		} catch(e) {
			console.error(e);
			setStatus("pending_received");
		}
	};

	const declineRequest = async () => {
		if(loading) return;
		setStatus("none");

		try {
			const response = await fetch(`${API_URL}${API.friendsDecline(netid)}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
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

		try {
			const response = await fetch(`${API_URL}${API.friendsRemove(netid)}`, {
				method: "DELETE",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) {
				const data = await response.json();
				setStatus(data.status);
			} else {
				setStatus("accepted");
			}
		} catch(e) {
			console.error(e);
			setStatus("accepted");
		}
	};

	if(status === "pending_received") {
		return (
			<div className={styles.friend_container}>
				<div className={styles.request_actions}>
					<button
						className={`${styles.friend_button} ${styles.accept}`}
						onClick={acceptRequest}
						disabled={loading}
						aria-label="Accept friend"
						title="Accept friend"
					>
						<FontAwesomeIcon icon={faUserCheck} className={styles.icon} />
						<span className={styles.tooltip}>Accept friend</span>
					</button>
					<button
						className={`${styles.friend_button} ${styles.decline}`}
						onClick={declineRequest}
						disabled={loading}
						aria-label="Decline friend"
						title="Decline friend"
					>
						<FontAwesomeIcon icon={faUserXmark} className={styles.icon} />
						<span className={styles.tooltip}>Decline friend</span>
					</button>
				</div>
			</div>
		);
	}

	const getButtonContent = () => {
		switch(status) {
			case "none":
				return { icon: faUserPlus, text: "Add friend", onClick: sendRequest, className: "" };
			case "pending_sent":
				return { icon: faUserClock, text: "Requested", onClick: () => {}, className: styles.pending };
			case "accepted":
				return { icon: faUserCheck, text: "Remove friend", onClick: removeFriend, className: styles.accepted };
		}
	};

	const btn = getButtonContent();

	return (
		<div className={styles.friend_container}>
			<button
				className={`${styles.friend_button} ${btn.className}`}
				onClick={btn.onClick}
				disabled={loading}
				aria-label={btn.text}
				title={btn.text}
			>
				<FontAwesomeIcon icon={btn.icon} className={styles.icon} />
				<span className={styles.tooltip}>{btn.text}</span>
			</button>
		</div>
	);
}
