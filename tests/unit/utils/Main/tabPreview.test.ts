import { describe, expect, it } from "bun:test";
import {
  CARD_IMAGE_HEIGHT,
  CARD_PAD_BOTTOM,
  CARD_PAD_SIDE,
  CARD_PAD_TOP,
  CARD_TEXT_HEIGHT,
  CARD_WIDTH,
  computeTabPreviewBounds,
  displayUrl,
  isPreviewAnchor,
} from "Utils/Main/tabPreview";

const base = {
  anchor: { left: 300, width: 180 },
  panelHeight: 40,
  contentWidth: 1200,
  contentHeight: 800,
  hasImage: true,
};

describe("computeTabPreviewBounds", () => {
  it("left-aligns the card with the tab, just under the panel", () => {
    const b = computeTabPreviewBounds(base);
    expect(b.x).toBe(300 - CARD_PAD_SIDE);
    expect(b.y).toBe(40);
    expect(b.width).toBe(CARD_WIDTH + CARD_PAD_SIDE * 2);
    expect(b.height).toBe(CARD_TEXT_HEIGHT + CARD_IMAGE_HEIGHT + CARD_PAD_TOP + CARD_PAD_BOTTOM);
  });

  it("is shorter without a thumbnail", () => {
    const b = computeTabPreviewBounds({ ...base, hasImage: false });
    expect(b.height).toBe(CARD_TEXT_HEIGHT + CARD_PAD_TOP + CARD_PAD_BOTTOM);
  });

  it("stays inside the window on the right edge", () => {
    const b = computeTabPreviewBounds({ ...base, anchor: { left: 1150, width: 60 } });
    expect(b.x + b.width).toBeLessThanOrEqual(1200);
    expect(b.x).toBeGreaterThanOrEqual(0);
  });

  it("never goes negative for a tab at the far left", () => {
    const b = computeTabPreviewBounds({ ...base, anchor: { left: 2, width: 60 } });
    expect(b.x).toBe(0);
  });

  it("follows a scaled panel", () => {
    const b = computeTabPreviewBounds({ ...base, panelHeight: 50 });
    expect(b.y).toBe(50);
  });
});

describe("displayUrl", () => {
  it("strips scheme, www and query", () => {
    expect(displayUrl("https://www.figma.com/design/abc123/My-file?node-id=1&fuid=9")).toBe(
      "figma.com/design/abc123/My-file",
    );
  });
  it("returns the input for non-URLs and empty for nothing", () => {
    expect(displayUrl("chrome://gpu")).toBe("chrome://gpu");
    expect(displayUrl(undefined)).toBe("");
  });
});

describe("isPreviewAnchor", () => {
  it("accepts a rect-like object and rejects anything else", () => {
    expect(isPreviewAnchor({ left: 10, width: 120 })).toBe(true);
    expect(isPreviewAnchor({ left: "10", width: 120 })).toBe(false);
    expect(isPreviewAnchor(null)).toBe(false);
    expect(isPreviewAnchor(42)).toBe(false);
  });
});
