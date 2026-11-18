export type AvatarImageFit = { width: string; height: string; left: string; top: string };

// Fit the visible artwork, not its transparent export canvas. A small inset
// protects antialiased hair tips, jewelry and other edge details from clipping.
export function getAvatarImageFit(pixels: Uint8ClampedArray, width: number, height: number): AvatarImageFit | null {
	let left = width, top = height, right = -1, bottom = -1;
	for(let y = 0; y < height; y++) {
		for(let x = 0; x < width; x++) {
			if(pixels[(y * width + x) * 4 + 3] <= 8) continue;
			left = Math.min(left, x);
			top = Math.min(top, y);
			right = Math.max(right, x);
			bottom = Math.max(bottom, y);
		}
	}
	if(right < left || bottom < top) return null;
	const visibleWidth = right - left + 1, visibleHeight = bottom - top + 1;
	const scale = 0.94 / Math.max(visibleWidth, visibleHeight);
	return {
		width: `${width * scale * 100}%`,
		height: `${height * scale * 100}%`,
		left: `${((1 - visibleWidth * scale) / 2 - left * scale) * 100}%`,
		top: `${((1 - visibleHeight * scale) / 2 - top * scale) * 100}%`,
	};
}
