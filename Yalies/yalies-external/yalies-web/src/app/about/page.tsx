"use client";
import { API_URL } from "@/consts";

import styles from "./about.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useState } from "react";
import { API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faXTwitter } from "@fortawesome/free-brands-svg-icons";

function TeamMember({ name, role, image, website, linkedin, x }: {
	name: string;
	role: string;
	image?: string;
	website?: string;
	linkedin?: string;
	x?: string;
}) {
	return (
		<div className={styles.team_card}>
			{image ? (
				<div className={styles.team_photo_wrapper}>
					<img className={styles.team_photo} src={image} alt={name} />
				</div>
			) : (
				<div className={styles.team_photo_placeholder}>{name[0]}</div>
			)}
			<div className={styles.team_info}>
				<span className={styles.team_name}>{name}</span>
				<span className={styles.team_role}>{role}</span>
				<div className={styles.team_links}>
					{website && (
						<a href={website} target="_blank" rel="noopener noreferrer" title="Website">
							<FontAwesomeIcon icon={faGlobe} />
						</a>
					)}
					{linkedin && (
						<a href={linkedin} target="_blank" rel="noopener noreferrer" title="LinkedIn">
							<FontAwesomeIcon icon={faLinkedin as import("@fortawesome/fontawesome-svg-core").IconProp} />
						</a>
					)}
					{x && (
						<a href={x} target="_blank" rel="noopener noreferrer" title="X">
							<FontAwesomeIcon icon={faXTwitter as import("@fortawesome/fontawesome-svg-core").IconProp} />
						</a>
					)}
				</div>
			</div>
		</div>
	);
}

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function AboutPage() {
	const [isAuthenticated, setAuthenticated] = useState(false);

	useEffect(() => {
		const checkAuth = async () => {
			try {
				const res = await fetch(`${API_URL}${API.profileMe}`, {
					credentials: "include",
				});
				setAuthenticated(res.ok);
			} catch {
				setAuthenticated(false);
			}
		};
		checkAuth();
	}, []);

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={isAuthenticated} />
			</Topbar>
			<div id={styles.about_page} className={logoFont.className}>
				<h1>About</h1>
				<p className={styles.intro}>
					Yalies is a website that provides data on the Yale Student Body.
					It combines data from <a href="https://students.yale.edu/facebook/">Yale Face Book</a> and <a href="https://directory.yale.edu/">Yale Directory</a>,
					with enhanced design, user experience, and security. It uses only data that Yale makes public.
				</p>

				<div className={styles.section}>
					<h2>Team</h2>

					<h3>Current team</h3>
					<div className={styles.team_grid}>
						<TeamMember
							name="Yavin Fickel"
							role="Yalies Lead"
							linkedin="https://linkedin.com/in/yavin"
						/>
					</div>

					<h3>Yalies alumni</h3>
					<div className={`${styles.team_grid} ${styles.alumni_grid}`}>
						<TeamMember
							name="Matei Coldea"
							role="Alumni, Creator, Yalies v3"
							image="/team/Matei_Coldea.jpg"
							website="https://mateicoldea.com/"
							linkedin="https://linkedin.com/in/mateicoldea"
							x="https://x.com/mateicoldea"
						/>
						<TeamMember
							name="Eric Yoon"
							role="Alumni, Creator, Yalies v2"
							image="/team/eric_yoon.jpg"
							website="https://ericyoon.com/"
							linkedin="https://linkedin.com/in/ericyoondotcom"
						/>
						<TeamMember
							name="Erik Boesen"
							role="Alumni, Creator, Yalies v1"
							image="/team/erik_boesen.jpg"
							website="https://erikboesen.com/"
							linkedin="https://linkedin.com/in/erikboesen"
							x="https://x.com/erikboesen"
						/>
						<TeamMember
							name="Daniel Wang"
							role="Alumni, Development"
							image="/team/daniel_wang.jpg"
						/>
					</div>

					<p className={styles.team_note}>
						Yalies was conceived and developed by Erik Boesen &apos;24.
						It was rewritten and continues to be maintained by the <a href="https://yalecomputersociety.org/">Yale Computer Society</a>.
					</p>

					<h2>Sponsors</h2>
					<p>
						A special thank you to our sponsors, who help fund the essential infrastructure
						for Yalies and other Y/CS products, keeping them free for everyone.
						Learn more about our sponsors on the{" "}
						<a href="https://yalecomputersociety.org/">Yale Computer Society website</a>.
					</p>
				</div>
			</div>
		</>
	);
}
