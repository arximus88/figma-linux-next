import { MENU_WIDTH } from "Const";

export const isMenuAnchor = (value: unknown): value is Types.MenuAnchor =>
  typeof value === "object" &&
  value !== null &&
  Number.isFinite((value as Types.MenuAnchor).left) &&
  Number.isFinite((value as Types.MenuAnchor).right) &&
  Number.isFinite((value as Types.MenuAnchor).bottom);

/**
 * Where the main menu pops: right-aligned under the "…" button when the panel
 * sent its rect, else under the panel's right edge computed from the window
 * width (the pre-anchor behaviour, kept for old panels and tests).
 */
export function mainMenuPosition(
  anchor: Types.MenuAnchor | null,
  windowWidth: number,
  panelHeight: number,
): { x: number; y: number } {
  if (anchor) {
    return {
      x: Math.max(0, Math.round(anchor.right) - MENU_WIDTH),
      y: Math.round(anchor.bottom),
    };
  }
  return { x: Math.max(0, windowWidth - MENU_WIDTH), y: panelHeight };
}
