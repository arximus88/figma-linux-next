/**
 * Geometry of the "New Group with This Tab" popover (see Main/Ui/TabGroupPromptView).
 *
 * Same reasoning as Utils/Main/tabPreview: the popover is a separate WebContentsView
 * laid over the tab content because the panel is only the top strip of the window —
 * anything it drew below that would be hidden behind the active tab's view. The
 * renderer page inside is sized to CARD_WIDTH/CARD_HEIGHT and draws its own shadow,
 * so the view carries transparent padding for it (must match the CSS in
 * renderer/GroupPrompt/App.svelte).
 */

import type { PreviewAnchor, Rect } from "./tabPreview";

export const CARD_WIDTH = 240;
/** Name input + color row + divider + actions row, see App.svelte for the exact sum. */
export const CARD_HEIGHT = 149;
/** Transparent margin around the card for its shadow. Small on top so the card
 *  hugs the strip without the view overlapping (and stealing clicks from) the panel. */
export const CARD_PAD_TOP = 4;
export const CARD_PAD_SIDE = 12;
export const CARD_PAD_BOTTOM = 16;

export interface TabGroupPromptLayout {
  anchor: PreviewAnchor;
  /** Height of the panel strip, i.e. where the tab content starts. */
  panelHeight: number;
  contentWidth: number;
  contentHeight: number;
}

/**
 * Bounds for the popover WebContentsView: left-aligned with the triggering tab and
 * pinned just under the panel strip, clamped to stay fully on screen. There is
 * nothing above the strip to flip to (it already sits at the window's top edge,
 * y=0..panelHeight) — clamping `y` against the window's bottom, the same way
 * `computeTabPreviewBounds` clamps the hover card, is all "stay on screen" needs
 * here.
 */
export function computeTabGroupPromptBounds(layout: TabGroupPromptLayout): Rect {
  const width = CARD_WIDTH + CARD_PAD_SIDE * 2;
  const height = CARD_HEIGHT + CARD_PAD_TOP + CARD_PAD_BOTTOM;

  const maxX = Math.max(0, layout.contentWidth - width);
  const x = Math.min(Math.max(0, Math.round(layout.anchor.left) - CARD_PAD_SIDE), maxX);

  const maxY = Math.max(0, layout.contentHeight - height);
  const y = Math.min(Math.round(layout.panelHeight), maxY);

  return { x, y, width, height };
}
