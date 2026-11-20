"use client";

import { useEffect, useState } from "react";
import { getAvatarImageFit, type AvatarImageFit } from "@/helpers/yalemojiImageFit";

const fits = new Map<string, Promise<AvatarImageFit | null>>();

function measure(source: string): Promise<AvatarImageFit | null> {
	let pending = fits.get(source);
	if(!pending) {
		pending = new Promise(resolve => {
			const image = new Image();
			image.onload = () => {
				try {
					// A bounded analysis canvas keeps work small even for large exports.
					const ratio = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
					const canvas = document.createElement("canvas");
					canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
					canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
					const context = canvas.getContext("2d", { willReadFrequently: true });
					if(!context) { resolve(null); return; }
					context.drawImage(image, 0, 0, canvas.width, canvas.height);
					resolve(getAvatarImageFit(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
				} catch { resolve(null); }
			};
			image.onerror = () => resolve(null);
			image.src = `/api/yalemoji/avatar-image?url=${encodeURIComponent(source)}`;
		});
		fits.set(source, pending);
	}
	return pending;
}

export function useYaleMojiImageFit(source?: string): AvatarImageFit | undefined {
	const [result, setResult] = useState<{ source: string; fit: AvatarImageFit | null }>();
	useEffect(() => {
		if(!source) return;
		let active = true;
		void measure(source).then(fit => { if(active) setResult({ source, fit }); });
		return () => { active = false; };
	}, [source]);
	return result?.source === source ? result?.fit ?? undefined : undefined;
}
