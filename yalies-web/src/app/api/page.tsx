"use client";

import Input from "@/components/Input";
import styles from "./api.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import { Lexend_Deca } from "next/font/google";
import { useEffect, useState } from "react";
import Button from "@/components/Button";
import { ApiKey } from "../../../../yalies-shared/datatypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { sendGAEvent } from "@next/third-parties/google";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function APIPage() {
	const [description, setDescription] = useState("");
	const [isUnauthenticated, setUnauthenticated] = useState(false);
	const [keys, setKeys] = useState<ApiKey[]>([]);
	
	const fetchApiKeys = async () => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/api-keys/list`, {
				method: "GET",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
			});
		} catch(e) {
			console.error(e);
			return;
		}
		if(!response) {
			console.error("No response from server");
			return;
		}
		if(!response.ok) {
			if(response.status === 401) {
				setUnauthenticated(true);
				return;
			}
			if(response.status === 403) {
				window.location.href = "/forbidden";
				return;
			}
			console.error("Error fetching API keys", response.status, response.statusText, await response.text());
			return;
		}
		setKeys(await response.json());
	};
	
	const createApiKey = async () => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/api-keys/create`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ description }),
			});
		} catch(e) {
			console.error(e);
			return;
		}
		if(!response) {
			console.error("No response from server");
			return;
		}
		if(!response.ok) {
			if(response.status === 401) {
				setUnauthenticated(true);
				return;
			}
			if(response.status === 403) {
				window.location.href = "/forbidden";
				return;
			}
			console.error("Error creating API key", response.status, response.statusText, await response.text());
			return;
		}
		const key = await response.json();
		setKeys([...keys, key]);
		sendGAEvent("event", "api-key-create");
	};

	const revokeApiKey = async (id: number) => {
		let response;
		try {
			response = await fetch(`${process.env.NEXT_PUBLIC_YALIES_API_URL}/v2/api-keys/revoke`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ id }),
			});
		} catch(e) {
			console.error(e);
			return;
		}
		if(!response) {
			console.error("No response from server");
			return;
		}
		if(!response.ok) {
			console.error("Error revoking API key", response.status, response.statusText, await response.text());
			return;
		}
		fetchApiKeys();
		sendGAEvent("event", "api-key-revoke");
	};

	useEffect(() => {
		fetchApiKeys();
	}, []);

	if(isUnauthenticated) {
		return (
			<>
				<Topbar>
					<Navbar />
				</Topbar>
				<div id={styles.api_page} className={logoFont.className}>
					<h1>API</h1>
					<p>Please sign in to learn about the Yalies API.</p>
				</div>
			</>
		);
	}

	const keyElems = keys.map(key => {
		return (
			<tr key={key.id}>
				<td>{key.description}</td>
				<td>{key.uses_count}</td>
				<td className={styles.key_cell}>
					{
						key.key ? (
							<Input disabled value={key.key} />
						) : "Only shown once"
					}
				</td>
				<td className={styles.revoke_cell} onClick={() => revokeApiKey(key.id)}>
					<FontAwesomeIcon icon={faTrash} />
				</td>
			</tr>
		);
	});

	const keyTable = keyElems.length > 0 && (
		<table id={styles.key_table}>
			<thead>
				<tr>
					<th>Description</th>
					<th>Uses</th>
					<th>Secret key</th>
				</tr>
			</thead>
			<tbody>
				{keyElems}
			</tbody>
		</table>
	)

	return (
		<>
			<Topbar>
				<Navbar isAuthenticated={true} />
			</Topbar>
			<div id={styles.api_page} className={logoFont.className}>
				<h1>API</h1>
				<p>
					The Yalies API can be used to programmatically query information about the student body in your own programs and software projects.
					Data is served in a developer-friendly JSON format.
				</p>
				<h2>Authentication</h2>
				<p>
					In order to verify your identity, you must create an API key below.
					When making HTTPS queries to the API,
					you must include this key in the <code>Authorization</code> header,
					prepended by the word <code>Bearer</code>.
				</p>
				<p>
					You should keep your API key a secret as if it were a password, as anyone with access to it
					can act on your behalf. Do not ship your API key with your client code, and do not commit it to version control.
					For more information, see <a href="https://blog.gitguardian.com/secure-your-secrets-with-env/" target="_blank">Secure Your Secrets with .env</a>.
				</p>
				{keyTable}
				<div id={styles.new_key_form}>
					<Input
						placeholder="Key description"
						value={description}
						onChange={e => setDescription(e.target.value)}
					/>
					<Button onClick={createApiKey}>Create key</Button>
				</div>
				<h2>Documentation</h2>
				<p>View the <a href="https://github.com/Yalies/Yalies/wiki" target="_blank">API documentation on Github Wiki</a>.</p>
				<p>Migrating from V1? View the <a href="https://github.com/Yalies/Yalies/wiki/V1-%E2%80%90--V2-Migration-Guide" target="_blank">migration guide</a>.</p>
			</div>
		</>
	);
}
