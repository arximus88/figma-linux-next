import { app, net, Event, protocol } from "electron";

import * as Const from "Const";
import { isAppAuthLink, isValidProjectLink } from "Utils/Common";
import Args from "./Args";
import { logger } from "./Logger";
import { storage } from "./Storage";
import ExtensionManager from "./ExtensionManager";

import WindowManager from "./Ui/WindowManager";
import Session from "./Session";
import FontManager from "./Fonts";

// Controllers
import { ipcRegistry } from "./controllers/registry";
import SettingsController from "./controllers/SettingsController";
import FontController from "./controllers/FontController";
import ClipboardController from "./controllers/ClipboardController";
import AuthController from "./controllers/AuthController";
import FileController from "./controllers/FileController";

export default class App {
  private authController: AuthController;

  constructor(
    private windowManager: WindowManager,
    private extensionManager: ExtensionManager,
    private session: Session,
    private fontManager: FontManager,
  ) {
    const isSingleInstance = app.requestSingleInstanceLock();

    if (!isSingleInstance) {
      app.emit("focusLastWindow");
      app.quit();
      return;
    }

    this.applySwitches();

    if (!app.isDefaultProtocolClient(Const.PROTOCOL)) {
      app.setAsDefaultProtocolClient(Const.PROTOCOL);
    }

    // Initialize controllers — registers all IPC handlers through the registry
    new SettingsController(this.windowManager);
    new FontController(this.fontManager);
    new ClipboardController();
    this.authController = new AuthController(this.windowManager);
    new FileController(this.windowManager);

    // WindowManager registers its own window/tab-specific IPC via registry
    this.windowManager.registerIpcHandlers();

    // Seal the registry — no more IPC registrations after this point
    ipcRegistry.seal();

    this.registerAppEvents();
  }

  private ready = (): void => {
    const { figmaUrl } = Args();

    this.windowManager.restoreState();
    this.session.handleAppReady();

    setTimeout(() => {
      if (figmaUrl !== "") {
        this.windowManager.openUrl(figmaUrl);
      }
    }, Const.STARTUP_DELAY_MS);

    protocol.handle(Const.PROTOCOL, (req: GlobalRequest) => {
      logger.info("protocol.handle, req.url: ", req.url);
      if (this.windowManager.tryHandleAppAuthRedeemUrl(req.url)) {
        return new Response();
      }

      this.windowManager.openUrl(req.url);

      return net.fetch(req.url, { method: req.method });
    });
  };

  private secondInstance(event: Event, argv: string[]) {
    let projectLink = "";
    logger.debug("second-instance, argv: ", argv);

    const paramIndex = argv.findIndex((i) => isValidProjectLink(i));
    const hasAppAuthorization = argv.find((i) => isAppAuthLink(i));

    logger.debug("second-instance, hasAppAuthorization: ", hasAppAuthorization);

    if (this.windowManager.tryHandleAppAuthRedeemUrl(hasAppAuthorization)) {
      return;
    }

    if (paramIndex !== -1) {
      projectLink = argv[paramIndex];
    }

    if (projectLink !== "") {
      this.windowManager.focusLastWindow();
      this.windowManager.openUrl(projectLink);
    }
  }

  private frontReady() {
    if (!this.session.hasFigmaSession) {
      app.emit("closeAllTab");
    }
  }

  private applySwitches() {
    // Chromium flags for better performance and GPU support
    // Full flags reference: https://peter.sh/experiments/chromium-command-line-switches/

    // Apply default performance optimizations for Linux
    this.applyDefaultOptimizations();

    const switches = storage.settings.app.commandSwitches;

    if (switches && switches.length) {
      for (const item of switches) {
        app.commandLine.appendSwitch(item.switch, item.value);
      }
    }

    const colorSpace = storage.settings.app.enableColorSpaceSrgb;

    if (colorSpace) {
      app.commandLine.appendSwitch("force-color-profile", "srgb");
    } else {
      app.commandLine.appendSwitch("disable-color-correct-rendering");
    }
  }

  private applyDefaultOptimizations() {
    // GPU Acceleration - critical for Figma's WebGL rendering
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("enable-zero-copy");

    // Collect all features to enable
    const features = [
      "VaapiVideoDecoder",
      "VaapiVideoEncoder",
      "CanvasOopRasterization",
      "WebRTCPipeWireCapturer",
      "UseSkiaRenderer",
    ];

    // Wayland support detection and enablement
    if (process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY) {
      logger.info("Wayland session detected - enabling native Wayland support");
      app.commandLine.appendSwitch("ozone-platform-hint", "auto");
      features.push("WaylandWindowDecorations", "UseOzonePlatform");
    }

    // Enable modern rendering features
    app.commandLine.appendSwitch("enable-features", features.join(","));

    // User-requested high-performance GPU flags
    // SECURITY: enable-unsafe-webgpu bypasses WebGPU safety checks.
    app.commandLine.appendSwitch("enable-unsafe-webgpu");

    // WebGL optimizations for Figma's canvas engine
    app.commandLine.appendSwitch("enable-webgl");
    app.commandLine.appendSwitch("enable-webgl2-compute-context");
    app.commandLine.appendSwitch("enable-accelerated-2d-canvas");

    // Disable smooth scrolling to let Figma handle it
    app.commandLine.appendSwitch("disable-smooth-scrolling");

    // Performance optimizations
    app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
    app.commandLine.appendSwitch("disable-background-timer-throttling");
    app.commandLine.appendSwitch("disable-renderer-backgrounding");

    logger.info("Applied default performance optimizations for Linux");
  }

  private onWindowAllClosed() {
    app.quit();
  }

  private relaunchApp() {
    app.relaunch();
    app.quit();
  }

  private async quitApp() {
    this.windowManager.saveState();
    await storage.save();

    app.quit();
  }

  private registerAppEvents = (): void => {
    app.on("ready", this.ready.bind(this));
    app.on("second-instance", this.secondInstance.bind(this));
    app.on("window-all-closed", this.onWindowAllClosed.bind(this));
    app.on("relaunchApp", this.relaunchApp.bind(this));
    app.on("signOut", () => this.authController.logout());
    app.on("quitApp", this.quitApp.bind(this));
  };
}
