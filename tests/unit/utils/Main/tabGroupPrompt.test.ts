import { describe, expect, it } from "bun:test";
import {
  CARD_HEIGHT,
  CARD_PAD_BOTTOM,
  CARD_PAD_SIDE,
  CARD_PAD_TOP,
  CARD_WIDTH,
  computeTabGroupPromptBounds,
} from "Utils/Main/tabGroupPrompt";

const base = {
  anchor: { left: 300, width: 180 },
  panelHeight: 40,
  contentWidth: 1200,
  contentHeight: 800,
};

describe("computeTabGroupPromptBounds", () => {
  it("left-aligns the popover with the tab, just under the panel", () => {
    const b = computeTabGroupPromptBounds(base);
    expect(b.x).toBe(300 - CARD_PAD_SIDE);
    expect(b.y).toBe(40);
    expect(b.width).toBe(CARD_WIDTH + CARD_PAD_SIDE * 2);
    expect(b.height).toBe(CARD_HEIGHT + CARD_PAD_TOP + CARD_PAD_BOTTOM);
  });

  it("stays inside the window on the right edge", () => {
    const b = computeTabGroupPromptBounds({ ...base, anchor: { left: 1150, width: 60 } });
    expect(b.x + b.width).toBeLessThanOrEqual(1200);
    expect(b.x).toBeGreaterThanOrEqual(0);
  });

  it("never goes negative for a tab at the far left", () => {
    const b = computeTabGroupPromptBounds({ ...base, anchor: { left: 2, width: 60 } });
    expect(b.x).toBe(0);
  });

  it("follows a scaled panel", () => {
    const b = computeTabGroupPromptBounds({ ...base, panelHeight: 50 });
    expect(b.y).toBe(50);
  });

  it("clamps y to 0 rather than go negative when the window is shorter than the popover", () => {
    // Same edge-case behavior as computeTabPreviewBounds: an impossibly short
    // window pins the popover to the top rather than push it off-screen.
    const b = computeTabGroupPromptBounds({ ...base, contentHeight: 60 });
    expect(b.y).toBe(0);
  });
});
