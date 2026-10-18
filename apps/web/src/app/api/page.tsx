"use client";
import { API_URL } from "@/consts";

import styles from "../about/about.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useState } from "react";
import { ApiKey, API } from "yalies-shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { sendGAEvent } from "@next/third-parties/google";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function ApiPage() {
	const [isAuthenticated, setAuthenticated] = useState(false);
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [keyDescription, setKeyDescription] = useState("");

	const fetchApiKeys = async () => {
		try {
			const response = await fetch(`${API_URL}${API.apiKeysList}`, {
				method: "GET",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if(response.ok) setKeys(await response.json());
		} catch(e) {
			console.error(e);
		}
	};

	useEffect(() => {
		const checkAuth = async () => {
			const res = await fetch(`${API_URL}${API.profileMe}`, {
				credentials: "include",
			});
			setAuthenticated(res.ok);
			if(res.ok) fetchApiKeys();
		};
		checkAuth();
	}, []);

	const createApiKey = async () => {
		try {
			const response = await fetch(`${API_URL}${API.apiKeysCreate}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: keyDescription }),
			});
			if(response.ok) {
				const key = await response.json();
				setKeys([...keys, key]);
				setKeyDescription("");
				sendGAEvent("event", "api-key-create");
			}
		} catch(e) {
			console.error(e);
		}
	};

	const revokeApiKey = async (id: number) => {
		try {
			const response = await fetch(`${API_URL}${API.apiKeysRevoke}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});
			if(response.ok) {
				fetchApiKeys();
				sendGAEvent("event", "api-key-revoke");
			}
		} catch(e) {
			console.error(e);
		}
	};

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={isAuthenticated} />
			</Topbar>
			<div id={styles.about_page} className={logoFont.className}>
				<h1>API</h1>
				<div className={styles.api_section}>
					<p>
						The Yalies API can be used to programmatically query information about the student body
						in your own programs and software projects. Data is served in a developer-friendly JSON format.
					</p>
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
						</>
					)}
					<h3>Documentation</h3>
					<p>View the <a href="https://github.com/Yalies/Yalies/wiki" target="_blank">API documentation on Github Wiki</a>.</p>
					<p>Migrating from V1? View the <a href="https://github.com/Yalies/Yalies/wiki/V1-%E2%80%90--V2-Migration-Guide" target="_blank">migration guide</a>.</p>
				</div>
			</div>
		</>
	);
}
