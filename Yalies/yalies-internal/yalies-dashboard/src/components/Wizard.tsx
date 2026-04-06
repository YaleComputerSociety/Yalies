"use client";

import { useState, useCallback, useMemo } from "react";
import type { WizardStepId, StepStatus } from "@/lib/types";
import StepIndicator from "@/components/StepIndicator";
import CookieStep from "@/components/CookieStep";
import ScrapeStep from "@/components/ScrapeStep";
import ReviewStep from "@/components/ReviewStep";
import Button from "@/components/Button";
import styles from "./wizard.module.scss";
import { PIPELINE_API } from "yalies-shared";

const STEP_IDS: WizardStepId[] = [
	"facebook-cookie",
	"facebook-scrape",
	"directory-cookie",
	"directory-enrich",
	"review-sync",
];

const STEP_LABELS: Record<WizardStepId, string> = {
	"facebook-cookie": "Yale Facebook Cookie",
	"facebook-scrape": "Scrape Students",
	"directory-cookie": "Directory Cookie",
	"directory-enrich": "Directory Enrich",
	"review-sync": "Review & Sync",
};

export default function Wizard() {
	const [currentStep, setCurrentStep] = useState(0);
	const [stepStatuses, setStepStatuses] = useState<Record<WizardStepId, StepStatus>>({
		"facebook-cookie": "active",
		"facebook-scrape": "pending",
		"directory-cookie": "pending",
		"directory-enrich": "pending",
		"review-sync": "pending",
	});
	const [facebookCookie, setFacebookCookie] = useState("");
	const [directoryCookie, setDirectoryCookie] = useState("");

	const markStep = useCallback((stepId: WizardStepId, status: StepStatus) => {
		setStepStatuses((prev) => ({ ...prev, [stepId]: status }));
	}, []);

	const advanceToNext = useCallback((completedStepId: WizardStepId) => {
		markStep(completedStepId, "done");
		const idx = STEP_IDS.indexOf(completedStepId);
		if (idx < STEP_IDS.length - 1) {
			const nextId = STEP_IDS[idx + 1];
			markStep(nextId, "active");
			setCurrentStep(idx + 1);
		}
	}, [markStep]);

	const handleFacebookCookieValidated = useCallback((cookie: string) => {
		setFacebookCookie(cookie);
		advanceToNext("facebook-cookie");
	}, [advanceToNext]);

	const handleFacebookScrapeComplete = useCallback(() => {
		advanceToNext("facebook-scrape");
	}, [advanceToNext]);

	const handleDirectoryCookieValidated = useCallback((cookie: string) => {
		setDirectoryCookie(cookie);
		advanceToNext("directory-cookie");
	}, [advanceToNext]);

	const handleDirectoryEnrichComplete = useCallback(() => {
		advanceToNext("directory-enrich");
	}, [advanceToNext]);

	const handleSynced = useCallback(() => {
		markStep("review-sync", "done");
	}, [markStep]);

	const goBack = useCallback(() => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
		}
	}, [currentStep]);

	const indicatorSteps = useMemo(() => {
		return STEP_IDS.map((id) => ({
			label: STEP_LABELS[id],
			status: stepStatuses[id],
		}));
	}, [stepStatuses]);

	const currentStepId = STEP_IDS[currentStep];
	const canGoBack = currentStep > 0;

	return (
		<div className={styles.container}>
			<StepIndicator steps={indicatorSteps} currentStep={currentStep} />

			<div className={styles.stepContent}>
				{currentStepId === "facebook-cookie" && (
					<CookieStep
						targetUrl="https://students.yale.edu/facebook/PhotoPageNew"
						cookieName="JSESSIONID"
						cookieLabel="Yale Facebook"
						cookieType="facebook"
						onValidated={handleFacebookCookieValidated}
					/>
				)}

				{currentStepId === "facebook-scrape" && (
					<ScrapeStep
						endpoint={PIPELINE_API.scrapeFacebook}
						cookie={facebookCookie}
						label="Scrape Facebook Directory"
						onComplete={handleFacebookScrapeComplete}
					/>
				)}

				{currentStepId === "directory-cookie" && (
					<CookieStep
						targetUrl="https://directory.yale.edu"
						cookieName="_people_search_session"
						cookieLabel="Yale Directory"
						cookieType="directory"
						onValidated={handleDirectoryCookieValidated}
					/>
				)}

				{currentStepId === "directory-enrich" && (
					<ScrapeStep
						endpoint={PIPELINE_API.scrapeDirectory}
						cookie={directoryCookie}
						label="Enrich from Yale Directory"
						onComplete={handleDirectoryEnrichComplete}
					/>
				)}

				{currentStepId === "review-sync" && (
					<ReviewStep onSynced={handleSynced} />
				)}
			</div>

			{canGoBack && (
				<div className={styles.navigation}>
					<Button variant="ghost" onClick={goBack}>
						Back
					</Button>
				</div>
			)}
		</div>
	);
}
