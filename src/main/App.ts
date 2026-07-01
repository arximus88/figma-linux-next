import { app, net, type Event, protocol } from "electron";

import * as Const from "Const";
import { isAppAuthLink, isValidProjectLink } from "Utils/Common";
import { readAppVersion } from "Utils/Main";
import Args from "./Args";
import { registerAppImageUrlHandler } from "./AppImageIntegration";
import { logger } from "./Logger";
import { storage } from "./Storage";

import type WindowManager from "./Ui/WindowManager";
import type Session from "./Session";
import type FontManager from "./Fonts";
import { McpServer } from "./MCP";
import type { FigmaViewProvider } from "./MCP";
import { MCP_PORT } from "./MCP/config";

// Controllers
import { ipcRegistry } from "./controllers/registry";
import SettingsController from "./controllers/SettingsController";
import ChangelogController from "./controllers/ChangelogController";
import FontController from "./controllers/FontController";
import ClipboardController from "./controllers/ClipboardController";
import AuthController from "./controllers/AuthController";
import FileController from "./controllers/FileController";

export default class App {
  private authController: AuthController;
  private mcpServer: McpServer;

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

    registerAppImageUrlHandler();

    this.mcpServer = new McpServer(logger);

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

    // Seal the registry — no more IPC registrations after this point
    ipcRegistry.seal();

    this.registerAppEvents();
  }

  private ready = (): void => {
    const { figmaUrl } = Args();

    this.windowManager.restoreState();
    this.session.handleAppReady();

    // Wire up the FigmaViewProvider — dynamically resolves the last focused window
    const viewProvider: FigmaViewProvider = {
      executeInBrowserView: (script: string) => {
        const win = this.windowManager.getLastFocusedWindow();
        if (!win) throw new Error("No Figma window open");
        return win.executeInBrowserView(script);
      },
      getActiveTabView: () => {
        const win = this.windowManager.getLastFocusedWindow();
        if (!win) return null;
        const tabId = win.getLatestFocusedTabId();
        if (!tabId) return null;
        const tab = win.tabs.get(tabId);
        return tab?.view ?? null;
      },
      getActiveTabUrl: () => {
        const win = this.windowManager.getLastFocusedWindow();
        if (!win) return null;
        const tabId = win.getLatestFocusedTabId();
        if (!tabId) return null;
        return win.getTabInfo(tabId)?.url ?? null;
      },
    };
    this.mcpServer.setViewProvider(viewProvider);
    this.mcpServer.setWriteToolsEnabled(!!storage.settings.mcp?.enableWriteTools);
    // Server is opt-out (default on). Only bind when enabled.
    if (storage.settings.mcp?.serverEnabled !== false) {
      this.mcpServer.start(storage.settings.mcp?.serverPort ?? MCP_PORT);
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
    }
  }

  private onWindowAllClosed() {
    // Persist window/tab state before the app exits — X-button close goes
    // through this path, not through the "Quit" menu, so without this the
    // "save last opened tabs" setting would never actually persist anything.
    // The MCP server must also be stopped here; otherwise its HTTP listener
    // on port 3845 keeps the event loop alive and the process hangs after
    // window close, blocking subsequent launches via the single-instance lock.
    this.mcpServer.stop();
    this.windowManager.saveState();
    storage.save().finally(() => app.quit());
  }

  private relaunchApp() {
    app.relaunch();
    app.quit();
  }

  private async quitApp() {
    this.mcpServer.stop();
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
    app.on("mcpWriteToolsChanged", (enabled: boolean) => {
      this.mcpServer.setWriteToolsEnabled(enabled);
    });
    app.on("mcpServerConfigChanged", ({ enabled, port }: { enabled: boolean; port: number }) => {
      // Our own http.Server — start/stop/rebind live, no app restart needed.
      if (enabled) void this.mcpServer.restart(port);
      else this.mcpServer.stop();
    });
  };

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
