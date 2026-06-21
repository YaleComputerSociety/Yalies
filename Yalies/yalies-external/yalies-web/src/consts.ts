export const MOBILE_WIDTH = 700;

export const API_URL = process.env.NEXT_PUBLIC_YALIES_API_URL || "http://localhost:8000";

export const isMobile = () => typeof window !== "undefined" && window.innerWidth < MOBILE_WIDTH;

export const COLLEGE_SHIELDS: Record<string, string> = {
	"BF": "/shields/BF.png",
	"BK": "/shields/BK.png",
	"BR": "/shields/BR.png",
	"DC": "/shields/DC.png",
	"ES": "/shields/ES.png",
	"GH": "/shields/GH.png",
	"JE": "/shields/JE.png",
	"MC": "/shields/MC.png",
	"MY": "/shields/MY.png",
	"PC": "/shields/PC.png",
	"SM": "/shields/SM.png",
	"SY": "/shields/SY.png",
	"TC": "/shields/TC.png",
	"TD": "/shields/TD.png",
};
