import { app, net, type Event, protocol } from "electron";

import * as Const from "Const";
import { isAppAuthLink, isValidProjectLink } from "Utils/Common";
import { readAppVersion } from "Utils/Main";
import Args from "./Args";
import { registerUrlHandler } from "./UrlHandlerIntegration";
import { logger } from "./Logger";
import { storage } from "./Storage";

import type WindowManager from "./Ui/WindowManager";
import Tab from "./Ui/Tab";
import TrayManager from "./Ui/TrayManager";
import type Session from "./Session";
import type FontManager from "./Fonts";
import { McpServer } from "./MCP";
import { FigmaAgentServer } from "./FigmaAgent";
import type { FigmaViewProvider } from "./MCP";
import { MCP_PORT } from "./MCP/config";
import { fileKeysOfUrl, urlMatchesFileKey } from "./MCP/utils/fileKey";

// Controllers
import { ipcRegistry } from "./controllers/registry";
import SettingsController from "./controllers/SettingsController";
import ChangelogController from "./controllers/ChangelogController";
import FontController from "./controllers/FontController";
import ClipboardController from "./controllers/ClipboardController";
import AuthController from "./controllers/AuthController";
import FileController from "./controllers/FileController";
import { mcpToolList } from "./MCP/tools/definitions";

export default class App {
  private authController: AuthController;
  private mcpServer: McpServer;
  private figmaAgent: FigmaAgentServer;
  private trayManager: TrayManager;

  constructor(
    private windowManager: WindowManager,
    private session: Session,
    private fontManager: FontManager,
  ) {
    const isSingleInstance = app.requestSingleInstanceLock();

    if (!isSingleInstance) {
      app.emit("focusLastWindow");
      app.quit();
      return;
    }

    // NOTE: Chromium command-line switches are applied synchronously in index.ts BEFORE
    // app.ready — NOT here. The constructor runs after `await storage.initialize()`, by
    // which point Chromium has already read its command line, so any appendSwitch here is
    // silently ignored. See applyChromiumSwitches.ts.

    if (!app.isDefaultProtocolClient(Const.PROTOCOL)) {
      app.setAsDefaultProtocolClient(Const.PROTOCOL);
    }

    registerUrlHandler();

    this.mcpServer = new McpServer(logger);
    this.figmaAgent = new FigmaAgentServer({
      isKnownUser: (id) => this.windowManager.getKnownUserIds().includes(id),
      openUrl: (url) => this.openUrlFromBrowser(url),
    });
    this.trayManager = new TrayManager(this.windowManager);

    // Initialize controllers — registers all IPC handlers through the registry
    new SettingsController(this.windowManager);
    new ChangelogController(this.windowManager);
    new FontController(this.fontManager);
    new ClipboardController();
    this.authController = new AuthController(this.windowManager);
    new FileController(this.windowManager);

    // WindowManager registers its own window/tab-specific IPC via registry
    this.windowManager.registerIpcHandlers();

    // MCP runtime status for the settings UI (real server/CDP state)
    ipcRegistry.handle("getMcpStatus", () => this.getMcpStatus(), "App");
    ipcRegistry.handle("getMcpTools", () => mcpToolList(), "App");
    ipcRegistry.handle("getFigmaAgentStatus", () => this.figmaAgent.getStatus(), "App");

    // Seal the registry — no more IPC registrations after this point
    ipcRegistry.seal();

    this.registerAppEvents();
  }

  private ready = (): void => {
    const { figmaUrl } = Args();

    this.windowManager.restoreState();
    this.session.handleAppReady();
    this.trayManager.apply(storage.settings.app.trayEnabled);

    // Wire up the FigmaViewProvider. Without a fileKey it follows the last
    // focused window's active tab; with one it finds the tab showing that file.
    const fileTab = (fileKey: string): Tab => {
      const found = this.windowManager.findFileTab(fileKey, urlMatchesFileKey);
      if (!found) {
        throw new Error(
          `File ${fileKey} is not open in figma-linux-next. Open it in the app, or omit fileKey to use the active tab.`,
        );
      }
      if ("discarded" in found) {
        throw new Error(
          `File ${fileKey}${found.title ? ` ("${found.title}")` : ""} has a tab but is not loaded yet (lazy session restore). Select its tab in the app once, then retry.`,
        );
      }
      return found.tab;
    };
    const activeTab = (): Tab | null => {
      const win = this.windowManager.getLastFocusedWindow();
      if (!win) return null;
      const tabId = win.getLatestFocusedTabId();
      if (!tabId) return null;
      const tab = win.tabs.get(tabId);
      return tab instanceof Tab ? tab : null;
    };
    const viewProvider: FigmaViewProvider = {
      executeInBrowserView: (script: string, fileKey?: string) => {
        if (fileKey) return fileTab(fileKey).view.webContents.executeJavaScript(script);
        const win = this.windowManager.getLastFocusedWindow();
        if (!win) throw new Error("No Figma window open");
        return win.executeInBrowserView(script);
      },
      getActiveTabView: (fileKey?: string) =>
        (fileKey ? fileTab(fileKey) : activeTab())?.view ?? null,
      // A new file has no key until Figma's editor has saved it once; the tab
      // starts on /<editor>/new and is replaced with /<editor>/<key>/... .
      openNewFileTab: async (url: string) => {
        const win = this.windowManager.getLastFocusedWindow();
        if (!win) throw new Error("No Figma window open");
        const tab = win.openTabInFront(url);
        if (!tab) throw new Error(`Could not open ${url}`);
        const wc = tab.view.webContents;
        // Figma saves a new file, and only then gives it a key, once its editor
        // has loaded; on a slow test machine that took minutes.
        const deadline = Date.now() + 180_000;
        const pageKeyScript =
          "(function(){var k=window.figma&&window.figma.fileKey;return k?location.origin+'/design/'+k+'/':location.href;})()";
        while (Date.now() < deadline) {
          if (wc.isDestroyed()) throw new Error("The new file's tab was closed");
          // The view's URL can lag behind the page's (history.replaceState), and
          // the Plugin API knows the key as soon as the editor has it.
          let current = tab.getUrl();
          if (!fileKeysOfUrl(current).length && !wc.isLoading()) {
            current = String(await wc.executeJavaScript(pageKeyScript).catch(() => current));
          }
          if (fileKeysOfUrl(current).length) {
            logger.info(`[MCP] create_new_file: ${current.split("?")[0]}`);
            return current;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        logger.warn(`[MCP] create_new_file: no file key after 180 s, tab at ${tab.getUrl()}`);
        throw new Error(
          "Figma has not finished creating the file after 3 minutes. It is open in the active tab: wait for it to load, then call get_file_info without fileKey.",
        );
      },
      getActiveTabUrl: (fileKey?: string) => {
        if (fileKey) return fileTab(fileKey).getUrl();
        const win = this.windowManager.getLastFocusedWindow();
        if (!win) return null;
        const tabId = win.getLatestFocusedTabId();
        if (!tabId) return null;
        return win.getTabInfo(tabId)?.url ?? null;
      },
    };
    this.mcpServer.setViewProvider(viewProvider);
    this.mcpServer.setWriteToolsEnabled(!!storage.settings.mcp?.enableWriteTools);
    this.mcpServer.setAiToolsEnabled(!!storage.settings.mcp?.enableAiTools);
    // Server is opt-out (default on). Only bind when enabled.
    if (storage.settings.mcp?.serverEnabled !== false) {
      this.mcpServer.start(storage.settings.mcp?.serverPort ?? MCP_PORT);
    }
    // Browser hand-off: figma.com in a browser probes this to offer "Open in desktop app".
    if (storage.settings.app.figmaAgentEnabled === true) {
      void this.figmaAgent.start();
    }

    setTimeout(() => {
      if (figmaUrl !== "") {
        this.windowManager.openUrl(figmaUrl);
      }
    }, Const.STARTUP_DELAY_MS);

    setTimeout(() => {
      // Skip the auto "What's new" popup under test: it's a separate
      // WebContentsView that overlays the panel and races e2e DOM capture.
      if (process.env.NODE_ENV === "test") return;
      const current = readAppVersion();
      const lastSeen = storage.settings.app.lastSeenChangelogVersion ?? "";
      if (lastSeen !== current) {
        this.windowManager.openChangelogViewForLastWindow();
      }
    }, Const.STARTUP_DELAY_MS + 400);

    protocol.handle(Const.PROTOCOL, (req: GlobalRequest) => {
      logger.info("protocol.handle, req.url: ", req.url);
      if (this.windowManager.tryHandleAppAuthRedeemUrl(req.url)) {
        return new Response();
      }

      this.windowManager.openUrl(req.url);

      return net.fetch(req.url, { method: req.method });
    });
  };

  private secondInstance(_event: Event, argv: string[]) {
    logger.debug("second-instance, argv: ", argv);

    const hasAppAuthorization = argv.find((i) => isAppAuthLink(i));
    if (this.windowManager.tryHandleAppAuthRedeemUrl(hasAppAuthorization)) {
      return;
    }

    // Guard: Args() will process.exit() on -v/-h — drop those flags from a
    // second invocation so the running app isn't killed by a help request.
    const safeArgv = argv.filter(
      (a) => a !== "-v" && a !== "--version" && a !== "-h" && a !== "--help",
    );
    const { figmaUrl, newWindow } = Args(safeArgv);

    // Tray mode: the process may be alive with no windows. A launch from the
    // desktop entry must bring one back, otherwise the click does nothing.
    if (!this.windowManager.hasWindows()) {
      this.windowManager.restoreState();
    }

    if (newWindow) {
      this.windowManager.newWindow();
      return;
    }

    // Covers --new-file=<type> (figmaUrl is /file/new?editor_type=...) and
    // direct figma:// or https://figma.com/... URLs passed on the command line.
    if (figmaUrl) {
      this.windowManager.focusLastWindow();
      this.windowManager.openUrl(figmaUrl);
      return;
    }

    const projectLinkIdx = argv.findIndex((i) => isValidProjectLink(i));
    if (projectLinkIdx !== -1) {
      this.windowManager.focusLastWindow();
      this.windowManager.openUrl(argv[projectLinkIdx]);
      return;
    }

    // A plain relaunch (dock icon, `figma-linux-next` in a terminal) with a
    // window already open: bring it up. focus() also restores a minimised
    // window — a user who cannot see it assumes the app hung.
    this.windowManager.focusLastWindow();
  }

  private onWindowAllClosed() {
    // With the tray enabled the process outlives its windows: the tray icon is
    // the way back in, and "Quit" from its menu goes through quitApp().
    // State is still persisted so a crash in the background loses nothing.
    if (this.trayManager.enabled) {
      this.windowManager.saveState();
      void storage.save();
      return;
    }
    // Persist window/tab state before the app exits — X-button close goes
    // through this path, not through the "Quit" menu, so without this the
    // "save last opened tabs" setting would never actually persist anything.
    // The MCP server must also be stopped here; otherwise its HTTP listener
    // on port 3845 keeps the event loop alive and the process hangs after
    // window close, blocking subsequent launches via the single-instance lock.
    this.mcpServer.stop();
    void this.figmaAgent.stop();
    this.windowManager.saveState();
    storage.save().finally(() => app.quit());
  }

  private async relaunchApp() {
    await this.windowManager.flushSettings();

    // `bun run dev`: vite-plugin-electron started this process and stops the
    // dev server when it exits, so app.relaunch() would come back to a dead
    // server — a blank panel. Save, then ask the dev server to restart us
    // (vite.config.mts, onstart).
    if (process.env.VITE_DEV_SERVER_URL && process.send) {
      this.mcpServer.stop();
      void this.figmaAgent.stop();
      this.windowManager.saveState();
      await storage.save();
      process.send(Const.DEV_RELAUNCH_MESSAGE);
      return;
    }

    app.relaunch();
    app.quit();
  }

  private async quitApp() {
    // Before app.quit(): closing a window whose Settings hasn't flushed holds
    // the close (Window.flushSettings), which would cancel the quit.
    await this.windowManager.flushSettings();
    this.mcpServer.stop();
    void this.figmaAgent.stop();
    this.windowManager.saveState();
    await storage.save();

    app.quit();
  }

  private registerAppEvents = (): void => {
    app.whenReady().then(this.ready.bind(this));
    app.on("second-instance", this.secondInstance.bind(this));
    app.on("window-all-closed", this.onWindowAllClosed.bind(this));
    app.on("relaunchApp", this.relaunchApp.bind(this));
    app.on("signOut", () => this.authController.logout());
    app.on("quitApp", this.quitApp.bind(this));
    app.on("trayEnabledChanged", (enabled: boolean) => this.trayManager.apply(enabled));
    app.on("mcpWriteToolsChanged", (enabled: boolean) => {
      this.mcpServer.setWriteToolsEnabled(enabled);
    });
    app.on("mcpAiToolsChanged", (enabled: boolean) => {
      this.mcpServer.setAiToolsEnabled(enabled);
    });
    app.on("mcpServerConfigChanged", ({ enabled, port }: { enabled: boolean; port: number }) => {
      // Our own http.Server — start/stop/rebind live, no app restart needed.
      if (enabled) void this.mcpServer.restart(port);
      else this.mcpServer.stop();
    });
    app.on("figmaAgentChanged", (enabled: boolean) => {
      if (enabled) void this.figmaAgent.start();
      else void this.figmaAgent.stop();
    });
  };

  /**
   * A file link handed over by figma.com in the browser. Mirrors second-instance:
   * with the tray on the process may be alive with no window to open it in.
   */
  private openUrlFromBrowser(url: string) {
    if (!this.windowManager.hasWindows()) {
      this.windowManager.restoreState();
    }
    this.windowManager.focusLastWindow();
    this.windowManager.openUrl(url);
  }

  /** Real runtime state of both MCP integrations, for the settings UI. */
  private getMcpStatus(): Types.McpStatus {
    const active = app.commandLine.hasSwitch("remote-debugging-port");
    const portStr = active ? app.commandLine.getSwitchValue("remote-debugging-port") : "";
    const cdpPort = portStr ? Number.parseInt(portStr, 10) : Number.NaN;
    return {
      server: this.mcpServer.getStatus(),
      cdp: { active, port: Number.isFinite(cdpPort) ? cdpPort : null },
    };
  }
}
