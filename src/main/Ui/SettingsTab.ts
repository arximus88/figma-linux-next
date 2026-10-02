import type { Rectangle } from "electron";

/** What SettingsTab needs from its window — kept narrow so it tests without Electron. */
export interface SettingsTabHost {
  view: {
    setVisible(visible: boolean): void;
    setBounds(bounds: Rectangle): void;
  };
  /** The tab-area rectangle below the panel. */
  bounds(): Rectangle;
  /** Hide the Figma tab currently on screen (Settings goes over its slot). */
  hideCurrentTab(): void;
  /** Put the last focused Figma tab back on screen and tell the panel. */
  refocusCurrentTab(): void;
  /** Message to the panel renderer. */
  notifyPanel(channel: "settingsTabOpened" | "settingsTabClosed" | "focusTab", arg?: string): void;
}

/**
 * Settings as a tab, the way a browser opens its settings page: one per
 * window, in the strip after the file tabs, focused again instead of opened
 * twice. It is not a TabManager tab — it never appears in `tabs`, so it is
 * kept out of session restore, closed-tab history, groups, drag and MCP by
 * construction. `lastFocusedTab` keeps pointing at the Figma tab underneath,
 * which is the one MCP and the menu act on.
 *
 * The view is attached to the window once, hidden (see Window.attachHidden)
 * and only toggled with setVisible here.
 */
export class SettingsTab {
  /** In the strip. */
  private open = false;
  /** On screen. */
  private shown = false;

  constructor(private host: SettingsTabHost) {}

  get isOpen() {
    return this.open;
  }
  get isShown() {
    return this.shown;
  }

  /** Open the tab if needed and bring it to the front. */
  show() {
    if (!this.open) {
      this.open = true;
      this.host.notifyPanel("settingsTabOpened");
    }
    if (!this.shown) {
      this.host.hideCurrentTab();
      this.host.view.setBounds(this.host.bounds());
      this.host.view.setVisible(true);
      this.shown = true;
    }
    this.host.notifyPanel("focusTab", "settingsTab");
  }

  /** Another tab is coming to the front; Settings stays in the strip. */
  hide() {
    if (!this.shown) return;
    this.host.view.setVisible(false);
    this.shown = false;
  }

  /** Remove the tab; if it was in front, the tab underneath comes back. */
  close() {
    if (!this.open) return;
    const wasShown = this.shown;
    this.hide();
    this.open = false;
    this.host.notifyPanel("settingsTabClosed");
    if (wasShown) this.host.refocusCurrentTab();
  }

  syncBounds() {
    if (this.shown) this.host.view.setBounds(this.host.bounds());
  }
}
