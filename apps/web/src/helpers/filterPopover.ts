type Viewport = { left: number; top: number; width: number; height: number };
type Anchor = { left: number; top: number; bottom: number };

// Use the visual viewport, including keyboard occlusion and pinch zoom.
export function getFilterPopoverLayout(anchor: Anchor, viewport: Viewport) {
	const gap = 8;
	const sheet = viewport.width <= 1024 || viewport.height <= 480;
	const width = Math.max(0, Math.min(sheet ? 420 : 312, viewport.width - gap * 2));
	const left = sheet ? viewport.left + (viewport.width - width) / 2
		: Math.max(viewport.left + gap, Math.min(anchor.left, viewport.left + viewport.width - width - gap));
	if (sheet) return {
		sheet, left, width, top: viewport.top + viewport.height - gap,
		height: Math.max(0, Math.min(560, viewport.height - gap * 2)), above: true,
	};
	const clampY = (y: number) => Math.max(viewport.top + gap, Math.min(y, viewport.top + viewport.height - gap));
	const anchorTop = clampY(anchor.top);
	const anchorBottom = clampY(anchor.bottom);
	const below = Math.max(0, viewport.top + viewport.height - anchorBottom - gap * 2);
	const above = Math.max(0, anchorTop - viewport.top - gap * 2);
	const flip = below < 300 && above > below;
	return {
		sheet, left, width, top: flip ? anchorTop - gap : anchorBottom + gap,
		height: Math.min(360, flip ? above : below), above: flip,
	};
}
