import Button from "./Button";
import styles from "./splash.module.scss";
import { Lexend_Deca } from "next/font/google";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function Splash() {
	return (
		<div id={styles.splash} className={logoFont.className}>
			<div id={styles.about}>
				<h1>The Yale search engine! ✨</h1>
				<p>🌎 Aggregates public information from Yale&#39;s <a href="https://students.yale.edu/facebook">existing</a> <a href="https://directory.yale.edu">websites</a></p>
				<p>🔒 Censors things Yale shouldn&#39;t be divulging (<a href="/faq">hide your info</a>)</p>
				<p>💞 Our <a href="/api">API</a> supports student projects serving 30,000+ users</p>
				<p>💻 Maintained by the <a href="http://yalecomputersociety.org">Yale Computer Society</a></p>
				<a href={process.env.NEXT_PUBLIC_YALIES_API_URL + "/v2/login"}>
					<Button>Log in with CAS</Button>
				</a>
			</div>
			<img src="/splash.svg" alt="Abstract image of people using our website" />
		</div>
	);
};
