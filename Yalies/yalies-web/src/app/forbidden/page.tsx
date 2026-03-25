import Button from "@/components/Button";
import Navbar from "@/components/Navbar";
import Topbar from "@/components/Topbar";

export default function ForbiddenPage() {
	return (
		<>
			<Topbar>
				<Navbar />
			</Topbar>
			<div style={{ textAlign: "center", padding: "60px 20px" }}>
				<h1>Forbidden</h1>
				<p>You must be in the Yale Directory to access this page.</p>
				<p style={{ marginTop: "12px", color: "#666", fontSize: "14px" }}>
					If you believe this is an error, try logging out and back in.
				</p>
				<div style={{ marginTop: "24px", display: "flex", gap: "12px", justifyContent: "center" }}>
					<a href={process.env.NEXT_PUBLIC_YALIES_API_URL + "/v2/login/logout"}>
						<Button>Log out</Button>
					</a>
					<a href="/">
						<Button>Go home</Button>
					</a>
				</div>
			</div>
		</>
	);
}
