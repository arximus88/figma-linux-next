import type { BrowserWindow, Rectangle } from "electron";
import { isDev } from "Utils/Common";
import { toggleDetachedDevTools } from "Utils/Main";
import type ChangelogView from "./ChangelogView";
import type SettingsView from "./SettingsView";

/**
 * ModalViewManager — owns the settings and changelog overlay views for a window.
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
  private settingsViewOpen = false;
  private changelogViewOpen = false;

  constructor(
    private window: BrowserWindow,
    private settingsView: SettingsView,
    private changelogView: ChangelogView,
  ) {
    // Both overlays load at window creation; attach them now, hidden, so
    // their first open is a plain setVisible like every later one.
    for (const view of [settingsView.view, changelogView.view]) {
      view.setVisible(false);
      this.window.contentView.addChildView(view);
    }
  }

  get isChangelogViewOpen(): boolean {
    return this.changelogViewOpen;
  }

  openSettingsView() {
    this.settingsViewOpen = true;
    const bounds = this.window.getBounds();
    this.settingsView.updateProps(bounds);

    this.window.contentView.addChildView(this.settingsView.view);
    this.settingsView.view.setVisible(true);

    if (isDev) toggleDetachedDevTools(this.settingsView.view.webContents);

    setTimeout(() => {
      this.settingsView.updateProps(bounds);
    }, 100);
  }

  closeSettingsView() {
    if (!this.settingsView.view) {
      return;
    }

    this.settingsViewOpen = false;
    this.settingsView.closeDevTools();

    this.settingsView.view.setVisible(false);

    this.settingsView.postClose();
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

  /** Re-apply the window bounds to whichever overlay is currently open. */
  syncBounds(bounds: Rectangle) {
    if (this.settingsViewOpen) {
      this.settingsView.updateProps(bounds);
    }
    if (this.changelogViewOpen) {
      this.changelogView.updateProps(bounds);
    }
  }

  destroy() {
    this.settingsView.destroy();
    this.changelogView.destroy();
  }
}
