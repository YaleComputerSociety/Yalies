"use client";

import styles from "./about.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiKey, API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faGlobe, faChevronDown, faChevronUp, faPlus, faMinus, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { sendGAEvent } from "@next/third-parties/google";

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
						<a href={website} target="_blank" title="Website">
							<FontAwesomeIcon icon={faGlobe} />
						</a>
					)}
					{linkedin && (
						<a href={linkedin} target="_blank" title="LinkedIn">
							<FontAwesomeIcon icon={faLinkedin} />
						</a>
					)}
					{x && (
						<a href={x} target="_blank" title="X">
							<FontAwesomeIcon icon={faXTwitter} />
						</a>
					)}
				</div>
			</div>
		</div>
	);
}

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function AboutPage() {
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");

	const [isAuthenticated, setAuthenticated] = useState(false);

	const [apiOpen, setApiOpen] = useState(tabParam === "api");
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [keyDescription, setKeyDescription] = useState("");

	useEffect(() => {
		const checkAuth = async () => {
			const res = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.profileMe}`, {
				credentials: "include",
			});
			setAuthenticated(res.ok);
			if (res.ok) fetchApiKeys();
		};
		checkAuth();
	}, []);

	const fetchApiKeys = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.apiKeysList}`, {
				method: "GET",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if (response.ok) setKeys(await response.json());
		} catch (e) {
			console.error(e);
		}
	};

	const createApiKey = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.apiKeysCreate}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: keyDescription }),
			});
			if (response.ok) {
				const key = await response.json();
				setKeys([...keys, key]);
				setKeyDescription("");
				sendGAEvent("event", "api-key-create");
			}
		} catch (e) {
			console.error(e);
		}
	};

	const revokeApiKey = async (id: number) => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}${API.apiKeysRevoke}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});
			if (response.ok) {
				fetchApiKeys();
				sendGAEvent("event", "api-key-revoke");
			}
		} catch (e) {
			console.error(e);
		}
	};

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
					<h2>API</h2>
				<div className={styles.api_section}>
					<p>
						The Yalies API can be used to programmatically query information about the student body
						in your own programs and software projects. Data is served in a developer-friendly JSON format.
					</p>
					{!apiOpen ? (
						<button
							className={styles.show_more}
							onClick={() => { setApiOpen(true); if (isAuthenticated) fetchApiKeys(); }}
						>
							Show more <FontAwesomeIcon icon={faChevronDown} />
						</button>
					) : (
						<>
							{!isAuthenticated ? (
								<p>Please sign in to manage API keys.</p>
							) : (
								<>
									<h3>Authentication</h3>
									<p>
										Create an API key below. Include it in the <code>Authorization</code> header
										prepended by <code>Bearer</code>.
									</p>
									<p>
										Keep your API key secret. Do not ship it with client code or commit it to version control.
										See <a href="https://blog.gitguardian.com/secure-your-secrets-with-env/" target="_blank">Secure Your Secrets with .env</a>.
									</p>

									{keys.length > 0 && (
										<div className={styles.key_table_wrapper}>
											<table className={styles.key_table}>
												<thead>
													<tr>
														<th>Description</th>
														<th>Uses</th>
														<th>Secret key</th>
														<th></th>
													</tr>
												</thead>
												<tbody>
													{keys.map(key => (
														<tr key={key.id}>
															<td>{key.description}</td>
															<td>{key.uses_count}</td>
															<td className={styles.key_cell}>
																{key.key ? <Input disabled value={key.key} /> : "Only shown once"}
															</td>
															<td className={styles.revoke_cell} onClick={() => revokeApiKey(key.id)}>
																<FontAwesomeIcon icon={faTrash} />
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}

									<div className={styles.new_key_form}>
										<Input
											placeholder="Key description"
											value={keyDescription}
											onChange={e => setKeyDescription(e.target.value)}
										/>
										<Button onClick={createApiKey}>Create key</Button>
									</div>

									<h3>Documentation</h3>
									<p>View the <a href="https://github.com/Yalies/Yalies/wiki" target="_blank">API documentation on Github Wiki</a>.</p>
									<p>Migrating from V1? View the <a href="https://github.com/Yalies/Yalies/wiki/V1-%E2%80%90--V2-Migration-Guide" target="_blank">migration guide</a>.</p>
								</>
							)}
							<button
								className={styles.show_more}
								onClick={() => setApiOpen(false)}
							>
								Show less <FontAwesomeIcon icon={faChevronUp} />
							</button>
						</>
					)}
					</div>

					<h2>Team</h2>
					<blockquote className={styles.quote}>
						&ldquo;If I have seen further, it is by standing on the shoulders of giants.&rdquo;
						<cite>Isaac Newton</cite>
					</blockquote>

					<h3>Product Leads</h3>
					<div className={styles.team_timeline}>
						<TeamMember
							name="Matei Coldea"
							role="Creator, Yalies v3"
							image="/team/Matei_Coldea.jpg"
							website="https://mateicoldea.com/"
							linkedin="https://linkedin.com/in/mateicoldea"
							x="https://x.com/mateicoldea"
						/>
						<FontAwesomeIcon icon={faArrowLeft} className={styles.team_arrow} />
						<TeamMember
							name="Eric Yoon"
							role="Creator, Yalies v2"
							image="/team/eric_yoon.jpg"
							website="https://ericyoon.com/"
							linkedin="https://linkedin.com/in/ericyoondotcom"
						/>
						<FontAwesomeIcon icon={faArrowLeft} className={styles.team_arrow} />
						<TeamMember
							name="Erik Boesen"
							role="Creator, Yalies v1"
							image="/team/erik_boesen.jpg"
							website="https://erikboesen.com/"
							linkedin="https://linkedin.com/in/erikboesen"
							x="https://x.com/erikboesen"
						/>
					</div>

					<h3>Developers</h3>
					<div className={styles.team_grid}>
						<TeamMember
							name="Daniel Wang"
							role="Developer"
							image="/team/daniel_wang.jpg"
						/>
					</div>

					<p>
						Yalies was conceived and developed by Erik Boesen &apos;24.
						It was rewritten and continues to be maintained by the <a href="https://yalecomputersociety.org/">Yale Computer Society</a>.
					</p>

					<h2>FAQ</h2>
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

					<h2>Sponsors</h2>
					<p>
						A special thank you to our sponsors, who help fund the essential infrastructure
						for Yalies and other Y/CS products, keeping them free for everyone.
						Learn more about our sponsors on the{" "}
						<a href="https://yalecomputersociety.org/">Yale Computer Society website</a>.
					</p>
					<div className={styles.sponsors}>
						<a href="https://www.hudsonrivertrading.com/" target="_blank"><img src="/sponsors/hrt-logo.png" alt="HRT" className={styles.sponsor_logo} /></a>
						<a href="https://www.minimaxi.com/" target="_blank"><img src="/sponsors/minimax-logo.png" alt="MiniMax" className={styles.sponsor_logo} /></a>
					</div>
				</div>
			</div>
		</>
	);
}
