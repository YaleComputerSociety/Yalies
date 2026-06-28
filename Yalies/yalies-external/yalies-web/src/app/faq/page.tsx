"use client";

import { API_URL } from "@/consts";
import styles from "../about/about.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { API } from "yalies-shared";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<div className={styles.faq_item}>
			<button className={styles.faq_question} onClick={() => setOpen(!open)}>
				<span>{question}</span>
				<FontAwesomeIcon icon={open ? faMinus : faPlus} className={styles.faq_icon} />
			</button>
			{open && <div className={styles.faq_answer}>{children}</div>}
		</div>
	);
}

export default function FaqPage() {
	const [isAuthenticated, setAuthenticated] = useState(false);

	useEffect(() => {
		const checkAuth = async () => {
			const res = await fetch(`${API_URL}${API.profileMe}`, {
				credentials: "include",
			});
			setAuthenticated(res.ok);
		};
		checkAuth();
	}, []);

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={isAuthenticated} />
			</Topbar>
			<div id={styles.about_page} className={logoFont.className}>
				<h1>FAQ</h1>
				<div className={styles.faq_list}>
					<FaqItem question="Where does my information come from?">
						<p>
							Yalies only uses data that is already <a href="https://registrar.yale.edu/yale-university-statement-disclosure-directory-information">publicly available to Yale students</a> &mdash; absolutely
							no protected information is revealed. NetIDs, UPIs, and emails come from the <a href="https://directory.yale.edu/">Yale Directory</a>,
							and everything else comes from the <a href="https://students.yale.edu/facebook/">Yale Face Book</a>.
						</p>
					</FaqItem>
					<FaqItem question="How do I remove my information from the Face Book?">
						<p>
							<a href="https://students.yale.edu/facebook/">Log in to the Face Book</a>,
							click <b>Edit</b> on the top, and select all fields you want to hide.
							Your changes will be reflected on Yalies during the next data update, usually after a week.
						</p>
					</FaqItem>
					<FaqItem question="How do I remove my information from the Yale Directory?">
						<p>
							Directory information is generally public record as a matter of FERPA policy.
							Yale College students may follow directions from the <a href="https://registrar.yale.edu/news/student-directory-opt-out-option">University Registrar&apos;s Office</a>
							{" "}to have their information removed. Yale recommends contacting <a href="mailto:registrar@yale.edu">registrar@yale.edu</a>.
							Bear in mind this may prevent you from using some Y/CS services.
						</p>
					</FaqItem>
					<FaqItem question="How can I add a pronunciation for my name?">
						<p>
							Yalies draws name pronunciations from <a href="https://name-coach.com">NameCoach</a>.
							You can provide this information to Yale by visiting <a href="https://yub.yale.edu/">Yale Hub</a>.
						</p>
					</FaqItem>
					<FaqItem question="I can't log in to Yalies, how do I re-gain access?">
						<p>
							You need to add yourself back to the directory at the <a href="https://directory.yale.edu/">Yale Directory</a>.
							You can do so in your <a href="https://yub.yale.edu/">Yale Hub</a> account under the personal data tab, directory listing option.
						</p>
					</FaqItem>
				</div>
			</div>
		</>
	);
}
