import type { BrowserWindow, Rectangle } from "electron";
import { isDev } from "Utils/Common";
import { toggleDetachedDevTools } from "Utils/Main";
import type ChangelogView from "./ChangelogView";
import type SettingsView from "./SettingsView";

/**
 * ModalViewManager — owns the settings and changelog overlay views for a window.
 *
 * Tracks which overlay is open, attaches/detaches it from the window's content
 * view, and keeps it bounds-synced. Extracted verbatim from Window.ts (Phase A2
 * of the Window decomposition); no behavior change. The view instances are
 * shared with Window (which still exposes their webContents ids), so this
 * manager only owns the open-state and the open/close orchestration.
 */
export class ModalViewManager {
  private settingsViewOpen = false;
  private changelogViewOpen = false;

  constructor(
    private window: BrowserWindow,
    private settingsView: SettingsView,
    private changelogView: ChangelogView,
  ) {}

  get isChangelogViewOpen(): boolean {
    return this.changelogViewOpen;
  }

  openSettingsView() {
    this.settingsViewOpen = true;
    const bounds = this.window.getBounds();
    this.settingsView.updateProps(bounds);

    this.window.contentView.addChildView(this.settingsView.view);

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

    this.window.contentView.removeChildView(this.settingsView.view);

    this.settingsView.postClose();
  }

  openChangelogView() {
    if (this.changelogViewOpen) return;
    this.changelogViewOpen = true;

    const bounds = this.window.getBounds();
    this.changelogView.updateProps(bounds);

    this.window.contentView.addChildView(this.changelogView.view);

    setTimeout(() => {
      this.changelogView.updateProps(bounds);
    }, 100);
  }

  closeChangelogView() {
    if (!this.changelogViewOpen) return;
    this.changelogViewOpen = false;
    this.changelogView.closeDevTools();
    this.window.contentView.removeChildView(this.changelogView.view);
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
