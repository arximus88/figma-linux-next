import type { BrowserWindow, Rectangle } from "electron";
import { storage } from "Main/Storage";
import { TOPPANELHEIGHT } from "Const";

/**
 * WindowGeometry — pure tab-view bounds math for a window.
 *
 * Computes the rectangle a tab's WebContentsView should occupy: full content
 * width, offset below the top panel. Extracted verbatim from Window.ts (Phase
 * A1 of the Window decomposition); no behavior change.
 */
export class WindowGeometry {
  constructor(private window: BrowserWindow) {}

  calcBoundsForTabView(): Rectangle {
    const panelHeight = storage.settings.app.panelHeight || TOPPANELHEIGHT;
    const contentBounds = this.window.getContentBounds();

    return {
      x: 0,
      y: panelHeight,
      width: contentBounds.width || 1200,
      height: (contentBounds.height || 900) - panelHeight,
    };
  }
}
