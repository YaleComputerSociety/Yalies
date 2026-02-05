import styles from "./faq.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import { Lexend_Deca } from "next/font/google";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function FAQPage() {
	return (
		<>
			<Topbar>
				<Navbar />
			</Topbar>
			<div id={styles.faq_page} className={logoFont.className}>
				<h1>FAQ</h1>
				<h2>Where does my information come from?</h2>
				<p>
					Yalies only uses data that is already <a href="https://registrar.yale.edu/yale-university-statement-disclosure-directory-information">publicly available to Yale students</a>—absolutely
					no protected information is revealed. NetIDs, UPIs, and emails come from the <a href="https://directory.yale.edu/">Yale Directory</a>, 
					and everything else comes from the <a href="https://students.yale.edu/facebook/">Yale Face Book</a>.
				</p>
				<h3>Removing information from the Face Book</h3>
				<p>
					To remove your data from the Face Book, first <a href="https://students.yale.edu/facebook/">log in to the Face Book</a>.
					Click <b>Edit</b> on the top, and select all fields you want to hide.
					Your changes will be reflected on Yalies during the next data update, usually after a week.
				</p>
				<h3>Removing information from the Yale Directory</h3>
				<p>
					Directory information is generally public record as a matter of FERPA policy.
					Yale College students may follow directions from the <a href="https://registrar.yale.edu/news/student-directory-opt-out-option">University Registrar&apos;s Office</a>
					&nbsp;to have their information removed from the central directory, Yale recommends that you contact <a href="mailto:registrar@yale.edu">registrar@yale.edu</a> to 
					request removal. Bear in mind this may prevent you from using some y/cs services.
				</p>
				<h2>How can I add a pronunciation for my name?</h2>
				<p>
					Yalies draws name pronunciations from <a href="name-coach.com">NameCoach</a>, a third-party
					company that Yale uses to provide name pronunciations, plus additional information like phonetic
					spelling and pronouns. You can provide this imformation to Yale by visiting <a href="https://yub.yale.edu/">Yale Hub</a>.
				</p>
				<h2>I can&apos;t log in to Yalies, how do I re-gain access?</h2>
				<p>
					You need to add yourself back to the directory of students at the <a href="https://directory.yale.edu/">Yale Directory</a>.
					You can do so in your <a href="https://yub.yale.edu/">Yale Hub</a> account under the personal data tab, directory listing option.
				</p>
			</div>
		</>
	);
}
