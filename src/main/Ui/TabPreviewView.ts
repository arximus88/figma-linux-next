import { type BrowserWindow, type Rectangle, WebContentsView } from "electron";

import { isDev } from "Utils/Common";
import {
  bridgePreloadPathDev,
  bridgePreloadPathProd,
  previewUrlDev,
  previewUrlProd,
} from "Utils/Main";

/**
 * TabPreviewView — the hover card that shows a tab's title, URL and last
 * thumbnail when the pointer rests on it (app.tabHoverPreviews).
 *
 * Why a separate WebContentsView: the panel is the BrowserWindow's own page and
 * only the top strip of it is visible — every tab is a child view laid over the
 * rest of the window, and child views always paint above the host page. A card
 * drawn by the panel itself would be hidden behind the tab. So the card is a
 * child view too, attached on hover and detached on leave, exactly like the
 * Settings overlay. It is created lazily on the first hover and kept for the
 * window's lifetime; only its bounds and payload change afterwards.
 */
export default class TabPreviewView {
  public view: WebContentsView;

  private attached = false;
  private ready = false;
  private pending: Types.TabPreviewPayload | null = null;

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

    this.view.webContents.once("did-finish-load", () => {
      this.ready = true;
      if (this.pending) this.push(this.pending);
    });
    this.view.webContents.loadURL(isDev ? previewUrlDev : previewUrlProd);
  }

  public get webContentsId() {
    return this.view.webContents.id;
  }

  public show(bounds: Rectangle, payload: Types.TabPreviewPayload) {
    if (this.window.isDestroyed() || this.view.webContents.isDestroyed()) return;
    this.view.setBounds(bounds);
    if (!this.attached) {
      this.window.contentView.addChildView(this.view);
      this.attached = true;
    }
    this.push(payload);
  }

  public hide() {
    if (!this.attached) return;
    this.attached = false;
    this.pending = null;
    if (this.window.isDestroyed()) return;
    try {
      this.window.contentView.removeChildView(this.view);
    } catch {
      // already detached
    }
  }

  private push(payload: Types.TabPreviewPayload) {
    if (!this.ready) {
      this.pending = payload;
      return;
    }
    this.pending = null;
    this.view.webContents.send("tabPreviewData", payload);
  }

  public destroy() {
    this.hide();
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.destroy();
    }
  }
}
