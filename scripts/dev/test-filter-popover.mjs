import assert from "node:assert/strict";
import test from "node:test";
import { getFilterPopoverLayout } from "../../apps/web/src/helpers/filterPopover.ts";

test("desktop picker stays on screen at the right edge and flips above low triggers", () => {
  const layout = getFilterPopoverLayout({ left: 1380, top: 680, bottom: 724 }, { left: 0, top: 0, width: 1440, height: 800 });
  assert.equal(layout.sheet, false);
  assert.equal(layout.above, true);
  assert.ok(layout.left + layout.width <= 1432);
  assert.ok(layout.top <= 680);
});

test("small screens, landscape, and an open keyboard keep the full panel inside the visual viewport", () => {
  for (const viewport of [
    { left: 0, top: 0, width: 320, height: 568 },
    { left: 0, top: 0, width: 844, height: 390 },
    { left: 0, top: 170, width: 390, height: 260 },
    { left: 90, top: 220, width: 320, height: 240 },
    { left: 0, top: 0, width: 1440, height: 400 },
  ]) {
    const layout = getFilterPopoverLayout({ left: 700, top: 650, bottom: 694 }, viewport);
    assert.equal(layout.sheet, true);
    assert.ok(layout.left >= viewport.left + 8);
    assert.ok(layout.left + layout.width <= viewport.left + viewport.width - 8);
    assert.ok(layout.top - layout.height >= viewport.top + 8);
    assert.ok(layout.top <= viewport.top + viewport.height - 8);
  }
});

test("resizing and scrolling cannot strand a desktop picker outside the viewport", () => {
  for (const width of [1025, 1280, 1920]) {
    for (const height of [481, 600, 1080]) {
      for (const y of [-200, 80, height - 40, height + 200]) {
        const viewport = { left: 25, top: 50, width, height };
        const layout = getFilterPopoverLayout({ left: width + 500, top: y, bottom: y + 44 }, viewport);
        const top = layout.above ? layout.top - layout.height : layout.top;
        assert.ok(layout.left >= viewport.left + 8);
        assert.ok(layout.left + layout.width <= viewport.left + width - 8);
        assert.ok(top >= viewport.top);
        assert.ok(top + layout.height <= viewport.top + height);
      }
    }
  }
});
