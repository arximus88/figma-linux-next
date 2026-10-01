import type { BrowserWindow, Rectangle } from "electron";
import type ChangelogView from "./ChangelogView";

/**
 * ModalViewManager — owns the changelog overlay view for a window. (Settings
 * used to be a second overlay; it is a tab now, see SettingsTab.)
 *
 * Tracks which overlay is open, shows/hides it in the window's content view,
 * and keeps it bounds-synced. Extracted from Window.ts (Phase A2 of the Window
 * decomposition). The view instances are shared with Window (which still
 * exposes their webContents ids), so this manager only owns the open-state and
 * the open/close orchestration.
 *
 * Overlays are attached (hidden) when the manager is created and afterwards
 * only toggled with setVisible; opening re-adds the view, which moves it above
 * any tab attached since. Detaching on close and re-attaching on the next open
 * is exactly what breaks on Wayland with Electron 44 (a re-attached view never
 * paints again — see Window.swapTo).
 */
export class ModalViewManager {
  private changelogViewOpen = false;

  constructor(
    private window: BrowserWindow,
    private changelogView: ChangelogView,
  ) {
    // Loads at window creation; attach it now, hidden, so its first open is a
    // plain setVisible like every later one.
    changelogView.view.setVisible(false);
    this.window.contentView.addChildView(changelogView.view);
  }

  get isChangelogViewOpen(): boolean {
    return this.changelogViewOpen;
  }

  openChangelogView() {
    if (this.changelogViewOpen) return;
    this.changelogViewOpen = true;

    const bounds = this.window.getBounds();
    this.changelogView.updateProps(bounds);

    this.window.contentView.addChildView(this.changelogView.view);
    this.changelogView.view.setVisible(true);

    setTimeout(() => {
      this.changelogView.updateProps(bounds);
    }, 100);
  }

  closeChangelogView() {
    if (!this.changelogViewOpen) return;
    this.changelogViewOpen = false;
    this.changelogView.closeDevTools();
    this.changelogView.view.setVisible(false);
  }

  /** Re-apply the window bounds to the overlay if it is open. */
  syncBounds(bounds: Rectangle) {
    if (this.changelogViewOpen) {
      this.changelogView.updateProps(bounds);
    }
  }

  destroy() {
    this.changelogView.destroy();
  }
}
