/**
 * Geometry of the tab hover card (see Main/Ui/TabPreviewView).
 *
 * The card is a separate WebContentsView laid over the tab content, because the
 * panel is only the top strip of the window and anything it drew below would be
 * hidden behind the tab's view. The renderer page inside is sized to CARD_WIDTH
 * and draws its own shadow, so the view carries transparent padding for it.
 */

export const CARD_WIDTH = 280;
export const CARD_TEXT_HEIGHT = 56;
export const CARD_IMAGE_HEIGHT = 158;
/** Transparent margin around the card for its shadow. Small on top so the card
 *  hugs the strip without the view overlapping (and stealing hover from) the panel. */
export const CARD_PAD_TOP = 4;
export const CARD_PAD_SIDE = 12;
export const CARD_PAD_BOTTOM = 16;

export interface PreviewAnchor {
  /** Tab wrapper rect in panel coordinates (already in window DIP: the panel's CSS zoom is folded in). */
  left: number;
  width: number;
}

export interface PreviewLayout {
  anchor: PreviewAnchor;
  /** Height of the panel strip, i.e. where the tab content starts. */
  panelHeight: number;
  contentWidth: number;
  contentHeight: number;
  hasImage: boolean;
}

export const isPreviewAnchor = (value: unknown): value is PreviewAnchor =>
  typeof value === "object" &&
  value !== null &&
  Number.isFinite((value as PreviewAnchor).left) &&
  Number.isFinite((value as PreviewAnchor).width);

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounds for the preview WebContentsView: left-aligned with the tab, kept inside the window. */
export function computeTabPreviewBounds(layout: PreviewLayout): Rect {
  const cardHeight = CARD_TEXT_HEIGHT + (layout.hasImage ? CARD_IMAGE_HEIGHT : 0);
  const width = CARD_WIDTH + CARD_PAD_SIDE * 2;
  const height = cardHeight + CARD_PAD_TOP + CARD_PAD_BOTTOM;

  const maxX = Math.max(0, layout.contentWidth - width);
  const x = Math.min(Math.max(0, Math.round(layout.anchor.left) - CARD_PAD_SIDE), maxX);

  const maxY = Math.max(0, layout.contentHeight - height);
  const y = Math.min(Math.round(layout.panelHeight), maxY);

  return { x, y, width, height };
}

/** `www.figma.com/design/abc/My-file?node=1` → `figma.com/design/abc/My-file` for the card's subtitle. */
export function displayUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return url;
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
}
