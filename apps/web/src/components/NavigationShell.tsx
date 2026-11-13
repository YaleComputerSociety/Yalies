"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Navbar, { type NavbarProps } from "./Navbar";
import Topbar from "./Topbar";
import { getProfile } from "@/hooks/useProfileCache";

type NavbarContentProps = Omit<NavbarProps, "isAuthenticated">;
type NavbarContentState = { owner: symbol; pathname: string; props: NavbarContentProps };
type RegisterNavbarContent = (pathname: string, props: NavbarContentProps) => () => void;
const NavbarContentContext = createContext<RegisterNavbarContent | null>(null);
type Session = {
	isAuthenticated: boolean | undefined;
	setAuthenticated: (authenticated: boolean) => void;
};
const SessionContext = createContext<Session | null>(null);

const NAVBAR_ROUTES = new Set(["/", "/profile", "/about", "/faq", "/api", "/forbidden"]);

export function useSession() {
	const session = useContext(SessionContext);
	if(!session) throw new Error("useSession requires NavigationShell");
	return session;
}

// Pages supply changing controls without owning (or remounting) the navbar.
export function NavbarContent(props: NavbarContentProps) {
	const register = useContext(NavbarContentContext);
	const pathname = usePathname();
	if(!register) throw new Error("NavbarContent requires NavigationShell");
	useLayoutEffect(() => register(pathname, props), [register, pathname, props]);
	return null;
}

export default function NavigationShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const showNavbar = NAVBAR_ROUTES.has(pathname);
	const [isAuthenticated, setAuthenticated] = useState<boolean>();
	const [content, setContent] = useState<NavbarContentState | null>(null);
	const register = useCallback<RegisterNavbarContent>((pathname, props) => {
		const owner = Symbol();
		setContent({ owner, pathname, props });
		return () => setContent(current => current?.owner === owner ? null : current);
	}, []);
	const session = useMemo(() => ({ isAuthenticated, setAuthenticated }), [isAuthenticated]);

	useEffect(() => {
		if(!showNavbar) return;
		let active = true;
		void getProfile().then(profile => {
			if(active) setAuthenticated(!!profile);
		});
		return () => { active = false; };
	}, [showNavbar]);

	// Ignore outgoing page controls immediately, even before their cleanup runs.
	const navbarProps = content?.pathname === pathname ? content.props : {};
	return (
		<SessionContext.Provider value={session}>
			<NavbarContentContext.Provider value={register}>
				{showNavbar && <Topbar><Navbar {...navbarProps} isAuthenticated={isAuthenticated} /></Topbar>}
				{children}
			</NavbarContentContext.Provider>
		</SessionContext.Provider>
	);
}
