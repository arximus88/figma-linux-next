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
 * child view too, shown on hover and hidden on leave, exactly like the
 * Settings overlay. It is created lazily on the first hover and kept attached
 * for the window's lifetime; only its bounds, visibility and payload change
 * afterwards. (Never detach and re-attach it: on Wayland with Electron 44 a
 * re-attached view stays invisible for good — see Window.swapTo.)
 */
export default class TabPreviewView {
  public view: WebContentsView;

  private attached = false;
  private shown = false;
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

    this.view.webContents.on("did-finish-load", () => {
      this.ready = true;
      if (this.pending) this.push(this.pending);
    });
    // A dead card renderer would otherwise read as "previews stopped working":
    // the view still attaches, nothing paints. Reload it; the next hover
    // re-sends its payload through `pending`.
    this.view.webContents.on("render-process-gone", (_event, details) => {
      this.ready = false;
      this.hide();
      if (details.reason === "clean-exit" || this.view.webContents.isDestroyed()) return;
      this.view.webContents.loadURL(isDev ? previewUrlDev : previewUrlProd);
    });
    this.view.webContents.loadURL(isDev ? previewUrlDev : previewUrlProd);
  }

  public get webContentsId() {
    return this.view.webContents.id;
  }

  public show(bounds: Rectangle, payload: Types.TabPreviewPayload) {
    if (this.window.isDestroyed() || this.view.webContents.isDestroyed()) return;
    this.view.setBounds(bounds);
    // Attaches on the first show; afterwards re-adding only moves the view to
    // the top, above any tab attached since — the card must overlay them all.
    this.window.contentView.addChildView(this.view);
    this.attached = true;
    this.view.setVisible(true);
    this.shown = true;
    this.push(payload);
  }

  public hide() {
    if (!this.shown) return;
    this.shown = false;
    this.pending = null;
    if (this.window.isDestroyed()) return;
    this.view.setVisible(false);
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
