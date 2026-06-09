export const MOBILE_WDITH = 700;

export const API_URL = process.env.NEXT_PUBLIC_YALIES_API_URL as string;

export const isMobile = () => typeof(window) !== "undefined" && window.innerWidth < MOBILE_WDITH;
