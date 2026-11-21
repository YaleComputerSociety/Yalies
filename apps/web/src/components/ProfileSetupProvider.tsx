"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { API, ACCOUNT_SETUP_MIN_POINTS, type AccountSetup, type DiscoveryField } from "yalies-shared";
import { API_URL } from "@/consts";
import YaleMojiLink from "./YaleMojiLink";
import DiscoveryOptions, { DISCOVERY_INTRO, discoveryChoiceUpdate } from "./DiscoveryOptions";
import styles from "./listsetup.module.scss";

async function fetchSetup(): Promise<AccountSetup> {
	const response = await fetch(`${API_URL}${API.profileMeSetup}`, { credentials: "include", cache: "no-store" });
	if(!response.ok) throw new Error("Could not check your account. Please try again.");
	return response.json();
}

type Access = (action: () => void, force?: boolean) => void;
const ProfileSetupContext = createContext<Access>(action => action());
export const useProfileSetup = () => useContext(ProfileSetupContext);

type Step = "yalemoji" | "discovery";

export default function ProfileSetupProvider({ children, isAuthenticated }: { children: ReactNode; isAuthenticated?: boolean }) {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("discovery");
	const [setup, setSetup] = useState<AccountSetup | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [waitingForAvatar, setWaitingForAvatar] = useState(false);
	const pending = useRef<(() => void) | null>(null);
	const checking = useRef(false);
	const mounted = useRef(true);
	const auth = useRef(isAuthenticated);
	auth.current = isAuthenticated;
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

	const requestAccess = useCallback<Access>((action, force = false) => {
		if(!auth.current) { action(); return; }
		if(checking.current) return;
		checking.current = true;
		pending.current = action;
		setError("");
		void fetchSetup().then(data => {
			if(!mounted.current) return;
			setSetup(data);
			if(!force && data.points >= ACCOUNT_SETUP_MIN_POINTS) { pending.current = null; action(); }
			else { setStep("discovery"); setOpen(true); }
		}).catch(err => {
			if(mounted.current) { setSetup(null); setStep("discovery"); setOpen(true); setError(err.message); }
		}).finally(() => { checking.current = false; });
	}, []);

	const close = useCallback(() => { setWaitingForAvatar(false); setOpen(false); pending.current = null; window.dispatchEvent(new Event("discovery-profile-updated")); }, []);
	useEffect(() => { if(!isAuthenticated) { setOpen(false); pending.current = null; } }, [isAuthenticated]);

	const saveChoice = async (field: DiscoveryField, value?: string) => {
		if(!setup || busy) return;
		const update = value === undefined ? { skip: field } : discoveryChoiceUpdate(setup.discovery_profile, field, value);
		if(!update) return;
		setBusy(true); setError("");
		try {
			const response = await fetch(`${API_URL}${API.profileMeDiscovery}`, {
				method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update),
			});
			if(!response.ok) throw new Error("Could not save your choice. Please try again.");
			const profile = await response.json();
			setSetup(current => current ? { ...current, discovery_profile: profile } : current);
		} catch(err) { setError((err as Error).message); }
		finally { setBusy(false); }
	};

	const finish = useCallback(() => {
		if(!busy) close();
	}, [busy, close]);
	useEffect(() => {
		if(!waitingForAvatar) return;
		const onReturn = () => { if(document.visibilityState !== "hidden") void finish(); };
		window.addEventListener("focus", onReturn);
		return () => window.removeEventListener("focus", onReturn);
	}, [waitingForAvatar, finish]);
	const advanceDiscovery = async () => {
		if(busy) return;
		setBusy(true); setError("");
		try {
			const current = await fetchSetup();
			setSetup(current); setWaitingForAvatar(false);
			if(current.yalemoji_set) close();
			else setStep("yalemoji");
		} catch(err) { setError((err as Error).message); }
		finally { setBusy(false); }
	};

	return <ProfileSetupContext.Provider value={requestAccess}>
		{children}
		{open && createPortal(<SetupDialog onClose={close}>
			<div className={styles.slide} key={step}>
				{step === "yalemoji" && <>
					<div className={styles.avatar}><img src="https://www.yalemoji.com/assets/default-avatar.png?v=3" alt="" /></div>
					<h2 id="setup-title">Create your Yalemoji</h2>
					<p>Est. time: 30-90 seconds</p>
				</>}
				{step === "discovery" && <>
					<h2 id="setup-title">Finish setting up your profile</h2>
					<p className={styles.discovery_intro}>{DISCOVERY_INTRO}</p>
					<DiscoveryOptions profile={setup?.discovery_profile ?? null} disabled={busy || !setup} onSelect={saveChoice} onSkip={field => void saveChoice(field)} />
				</>}

			</div>
			{error && <p role="alert" className={styles.error}>{error}</p>}
			<div className={styles.actions}>
				{step === "yalemoji" && <>
					<button type="button" className={styles.secondary} disabled={busy} onClick={() => void finish()}>Not now</button>
					{waitingForAvatar ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void finish()}>Finish</button> : <YaleMojiLink className={styles.create} href="https://yalemoji.com/create?ref=yalies" target="_blank" rel="noopener noreferrer" onClick={() => setWaitingForAvatar(true)}>Create now</YaleMojiLink>}
				</>}
				{step === "discovery" && <>
					<button type="button" className={styles.secondary} disabled={busy} onClick={() => void advanceDiscovery()}>Not Now</button>
					<button type="button" className={styles.primary} disabled={busy} onClick={() => {
						if(!setup) { const action = pending.current; if(action) requestAccess(action); }
						else void advanceDiscovery();
					}}>{setup ? "Done" : "Try again"}</button>
				</>}
			</div>
		</SetupDialog>, document.body)}
	</ProfileSetupContext.Provider>;
}

function SetupDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		ref.current?.showModal();
		return () => { document.body.style.overflow = overflow; previous?.focus(); };
	}, []);
	return <dialog ref={ref} className={styles.dialog} aria-labelledby="setup-title" onCancel={event => { event.preventDefault(); onClose(); }}>
		<div className={styles.content}>{children}</div>
	</dialog>;
}
