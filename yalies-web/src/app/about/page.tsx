import styles from "./about.module.scss";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";
import { Lexend_Deca } from "next/font/google";

const logoFont = Lexend_Deca({ subsets: ["latin"] });

export default function AboutPage() {
	return (
		<>
			<Topbar>
				<Navbar />
			</Topbar>
			<div id={styles.about_page} className={logoFont.className}>
				<h1>About</h1>
				<p>
					Yalies is a website that provides data on the Yale Student Body.
					It combines data from <a href="https://students.yale.edu/facebook/"> Yale Face Book</a> and <a href="https://directory.yale.edu/">Yale Directory</a>,
					with enhanced design, user experience, and security. It uses only data that Yale makes public.
					To learn how to remove your data from Yale&apos;s publicly published data set, see <a href="https://yalies.io/faq">here</a>.
				</p>
				<h2>API</h2>
				<p>
					Yalies also provides <a href="/api">an API</a> for student developers!
				</p>
				<p>
					The API powers numerous student projects and university services,
					including <a href="https://coursetable.com/">CourseTable</a>,&nbsp;
					<a href="https://yalemenus.com/">Yale Menus</a>,&nbsp;
					<a href="https://rdb.onrender.com/">Yale Research Database (RDB)</a>,&nbsp;
					<a href="https://yaledailynews.com/blog/2020/12/03/40-2-percent-of-returning-student-athletes-take-leaves-of-absence-this-fall/">Yale Daily News</a>,&nbsp;
					<a href="https://mailyale.com/">MailYale</a>,&nbsp;
					<a href="https://comethru.io/">Comethru</a>,&nbsp;
					<a href="https://singleyalies.com/">Single Yalies</a>,&nbsp;
					students in S&DS 315 and CPSC 490, and more.
				</p>
				<h2>Source Code</h2>
				<p>
					This project is open-source and contributions are welcome!
					See <a href="https://github.com/Yalies/Yalies/">our Github repo</a> for more.
				</p>
				<p>
					Interested in joining the Yalies team? Apply for <a href="https://yalecomputersociety.org/">Y/CS</a>.
				</p>
				<h2>Author</h2>
				<p>
					Yalies was conceived and developed by <a href="https://erikboesen.com/">Erik Boesen &apos;24</a>.
					It was rewritten and continues to be maintained by the <a href="https://yalecomputersociety.org/">Yale Computer Society</a>.
				</p>
			</div>
		</>
	);
}
