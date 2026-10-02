import { type BrowserWindow, type Rectangle, WebContentsView } from "electron";

import { isDev } from "Utils/Common";
import {
  bridgePreloadPathDev,
  bridgePreloadPathProd,
  groupPromptUrlDev,
  groupPromptUrlProd,
} from "Utils/Main";

/**
 * TabGroupPromptView — the floating "name this group" popover shown after
 * "New Group with This Tab" (app.tabGroups), modeled directly on
 * Main/Ui/TabPreviewView.
 *
 * Why a separate WebContentsView: same reason as the tab preview card — the
 * panel is the BrowserWindow's own page and only the top strip of it is
 * visible, so a popover drawn by the panel itself would render hidden behind
 * the active tab's view. It is created lazily on first use and kept attached
 * for the window's lifetime; only its bounds, visibility and payload change
 * afterwards (never detach/re-attach — see Window.swapTo).
 *
 * Unlike the read-only preview card, this view is interactive (name input,
 * color swatches, buttons), so it takes OS input focus on show. Losing that
 * focus — the user clicking the panel or the tab underneath — is treated as
 * "click outside" and closes the popover with no side effects, the same way
 * a native popover would.
 */
export default class TabGroupPromptView {
  public view: WebContentsView;

  private attached = false;
  private shown = false;
  private ready = false;
  private pending: Types.TabGroupPromptPayload | null = null;

  constructor(private window: BrowserWindow) {
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: isDev ? bridgePreloadPathDev : bridgePreloadPathProd,
        experimentalFeatures: false,
      },
    });
    // Transparent so the card's rounded corners and shadow sit on the tab content.
    this.view.setBackgroundColor("#00000000");

    this.view.webContents.on("did-finish-load", () => {
      this.ready = true;
      if (this.pending) this.push(this.pending);
    });
    // A dead popover renderer would otherwise read as "the feature silently
    // stopped working": the view still attaches, nothing paints. Reload it;
    // the next show() re-sends its payload through `pending`.
    this.view.webContents.on("render-process-gone", (_event, details) => {
      this.ready = false;
      this.hide();
      if (details.reason === "clean-exit" || this.view.webContents.isDestroyed()) return;
      this.view.webContents.loadURL(isDev ? groupPromptUrlDev : groupPromptUrlProd);
    });
    // Losing input focus = a click landed on the panel or the tab behind the
    // popover, i.e. "click outside". Dismiss with no side effects, exactly
    // like Cancel.
    this.view.webContents.on("blur", () => this.hide());
    this.view.webContents.loadURL(isDev ? groupPromptUrlDev : groupPromptUrlProd);
  }

  public get webContentsId() {
    return this.view.webContents.id;
  }

  public show(bounds: Rectangle, payload: Types.TabGroupPromptPayload) {
    if (this.window.isDestroyed() || this.view.webContents.isDestroyed()) return;
    this.view.setBounds(bounds);
    // Attaches on the first show; afterwards re-adding only moves the view to
    // the top, above any tab attached since — the popover must overlay them all.
    this.window.contentView.addChildView(this.view);
    this.attached = true;
    this.view.setVisible(true);
    this.shown = true;
    this.push(payload);
    // Optional chaining purely for test-double friendliness — real
    // WebContents always has focus(); this is how the popover takes input so
    // the autofocused name input is actually usable, and it's what makes the
    // "click outside closes it" blur listener above fire in the first place.
    this.view.webContents.focus?.();
  }

  public hide() {
    if (!this.shown) return;
    this.shown = false;
    this.pending = null;
    if (!this.window.isDestroyed()) this.view.setVisible(false);
  }

  private push(payload: Types.TabGroupPromptPayload) {
    if (!this.ready) {
      this.pending = payload;
      return;
    }
    this.pending = null;
    this.view.webContents.send("tabGroupPromptData", payload);
  }

  public destroy() {
    this.hide();
    if (this.attached && !this.window.isDestroyed()) {
      this.attached = false;
      try {
        this.window.contentView.removeChildView(this.view);
      } catch {
        // window tearing down
      }
    }
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.destroy();
    }
  }
}
