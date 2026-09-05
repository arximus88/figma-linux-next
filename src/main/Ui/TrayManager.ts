import { app, Menu, nativeImage, Tray } from "electron";

import { logger } from "Main/Logger";
import { detectFrameStyle } from "Utils/Main/desktopEnvironment";
import colorIconDataUrl from "../../../resources/icons/48x48.png?inline";
import symbolicIconDataUrl from "../../../resources/icons/tray-symbolic.png?inline";

import type WindowManager from "./WindowManager";

/**
 * System tray icon (StatusNotifierItem over D-Bus).
 *
 * Electron's Tray on Linux speaks StatusNotifierItem, which KDE Plasma renders
 * natively and GNOME only with the AppIndicator extension. Left-click works on
 * Plasma but not with AppIndicator (there it opens the menu), so the context
 * menu always carries a "Show" entry — never rely on the click alone.
 *
 * While the tray is enabled, closing the last window keeps the process alive
 * (see App.onWindowAllClosed); the tray is then the only way back in, which is
 * why the setting defaults to off.
 *
 * The icons are inlined as data URLs at build time: the on-disk location of
 * resources/icons differs between electron-builder, the AUR package and the
 * Flatpak, and a wrong path yields a silently invisible tray icon. GNOME's
 * top bar expects a monochrome (symbolic) glyph; Plasma shows app icons in
 * colour, so the pick follows the same desktop detection as the window frame.
 */
export default class TrayManager {
  private tray: Tray | null = null;

  constructor(private windowManager: WindowManager) {}

  public get enabled(): boolean {
    return this.tray !== null;
  }

  /** Create or destroy the tray to match `enabled`. Idempotent. */
  public apply(enabled: boolean): void {
    this.windowManager.setKeepAliveWithoutWindows(enabled);
    if (enabled) this.create();
    else this.destroy();
  }

  private create(): void {
    if (this.tray) return;
    if (!app.isReady()) {
      // Tray throws before app.ready.
      app.whenReady().then(() => this.create());
      return;
    }

    try {
      const dataUrl = detectFrameStyle() === "kde" ? colorIconDataUrl : symbolicIconDataUrl;
      const icon = nativeImage.createFromDataURL(dataUrl);
      this.tray = new Tray(icon);
    } catch (error) {
      logger.error("Failed to create tray icon:", error);
      this.tray = null;
      return;
    }

    this.tray.setToolTip("Figma");
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Figma", click: () => this.showWindow() },
        { label: "New Window", click: () => this.windowManager.newWindow() },
        { type: "separator" },
        {
          label: "Settings…",
          click: () => {
            this.showWindow();
            this.windowManager.openSettingsView();
          },
        },
        { type: "separator" },
        { label: "Quit", click: () => app.emit("quitApp") },
      ]),
    );
    this.tray.on("click", () => this.showWindow());

    logger.info("Tray icon created");
  }

  private destroy(): void {
    if (!this.tray) return;
    this.tray.destroy();
    this.tray = null;
    logger.info("Tray icon destroyed");
  }

  private showWindow(): void {
    if (this.windowManager.hasWindows()) {
      this.windowManager.focusLastWindow();
      return;
    }
    // Last window was closed while the tray kept the process alive.
    this.windowManager.restoreState();
  }
}
