export const MOBILE_WDITH = 700;

export const isMobile = () => typeof(window) !== "undefined" && window.innerWidth < MOBILE_WDITH;
