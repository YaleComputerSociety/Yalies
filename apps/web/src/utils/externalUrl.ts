export function normalizeExternalUrl(url: string | null | undefined) {
	const trimmedUrl = url?.trim();
	if(!trimmedUrl) return "";

	if(/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
	if(trimmedUrl.startsWith("//")) return `https:${trimmedUrl}`;
	return `https://${trimmedUrl.replace(/^\/+/, "")}`;
}

const SOCIAL_HOSTS = {
	linkedin: new Set(["linkedin.com", "www.linkedin.com"]),
	instagram: new Set(["instagram.com", "www.instagram.com"]),
};

type SocialPlatform = keyof typeof SOCIAL_HOSTS;

export function normalizeSocialUrl(platform: SocialPlatform, url: string | null | undefined) {
	const normalizedUrl = normalizeExternalUrl(url);
	if(!normalizedUrl) return "";

	try {
		const parsedUrl = new URL(normalizedUrl);
		if(parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
		if(!SOCIAL_HOSTS[platform].has(parsedUrl.hostname.toLowerCase())) return null;
		return normalizedUrl;
	} catch {
		return null;
	}
}

export function getSocialUrlError(platform: SocialPlatform, url: string | null | undefined) {
	const trimmedUrl = url?.trim();
	if(!trimmedUrl) return "";
	if(normalizeSocialUrl(platform, trimmedUrl)) return "";
	return platform === "linkedin"
		? "LinkedIn URL must be on linkedin.com."
		: "Instagram URL must be on instagram.com.";
}
