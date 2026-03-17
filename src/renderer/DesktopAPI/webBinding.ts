import type { IpcRendererEvent } from "electron";
import * as E from "electron";

import { sendMsgToMain, registerCallbackWithMainProcess } from "Utils/Render/webBindingsHelpers";

import { isPrototypeUrl, isValidFigjamLink, isValidProjectLink } from "Utils/Common";

interface IntiApiOptions {
  version: number;
  appVersion: string;
  fileBrowser: boolean;
}

const API_VERSION = 111;
const APP_VERSION = "999.0.0";
let webPort: MessagePort;
const mainProcessCancelCallbacks: Map<number, () => void> = new Map();

const onWebMessage = (event: MessageEvent) => {
  const msg = event.data;

  if (!msg) return;

  if (msg.callbackID != null) {
    const cancel = registerCallbackWithMainProcess(msg.name, msg.args, (args: any) => {
      webPort.postMessage({ args, callbackID: msg.callbackID });
    });
    mainProcessCancelCallbacks.set(msg.callbackID, cancel);
    return;
  }
  if (msg.cancelCallbackID != null) {
    mainProcessCancelCallbacks.get(msg.cancelCallbackID)();
    mainProcessCancelCallbacks.delete(msg.cancelCallbackID);
    return;
  }
  if (!msg.name || !(msg.name in publicAPI)) {
    sendMsgToMain("logWarn", "[desktop] Unhandled message", msg.name);
    return;
  }

  let resultPromise = undefined;

  try {
    resultPromise = msg.name && publicAPI && publicAPI[msg.name](msg.args);
  } catch (e) {
    console.error("onWebMessage, err: ", msg.name, e);
    throw e;
  } finally {
    if (msg.promiseID != null) {
      if (resultPromise instanceof Promise) {
        resultPromise
          .then((result) => {
            webPort.postMessage({ result: result.data, promiseID: msg.promiseID });
          })
          .catch((error) => {
            const errorString = (error && error.name) || "Promise error";
            webPort.postMessage({ error: errorString, promiseID: msg.promiseID });
          });
      } else {
        webPort.postMessage({ error: "No result" + resultPromise, promiseID: msg.promiseID });
      }
    }
  }
};

const initWebApi = (props: IntiApiOptions) => {
  const channel = new MessageChannel();
  const pendingPromises = new Map();
  const registeredCallbacks = new Map();

  let messageHandler: (name: string, args: any) => void;
  let nextPromiseID = 0;
  let nextCallbackID = 0;

  window.__figmaContent = false;

  if (/file\/.+/.test(location.href)) {
    props.fileBrowser = false;
  }

  window.__figmaDesktop = {
    version: props.version,
    appVersion: props.appVersion,
    fileBrowser: props.fileBrowser,
    postMessage: function (name, args, transferList): void {
      if (import.meta.env.DEV) console.debug("[webBinding] postMessage:", name, args);
      channel.port1.postMessage({ name, args }, transferList);
    },
    registerCallback: function (name, args, callback) {
      const id = nextCallbackID++;
      if (import.meta.env.DEV)
        console.debug(`[webBinding] registerCallback id="${id}" name="${name}"`);
      registeredCallbacks.set(id, callback);
      channel.port1.postMessage({ name, args, callbackID: id });
      return (): void => {
        channel.port1.postMessage({ cancelCallbackID: id });
      };
    },
    promiseMessage: function (name, args, transferList) {
      return new Promise((resolve, reject) => {
        const id = nextPromiseID++;
        pendingPromises.set(id, { resolve, reject });
        channel.port1.postMessage({ name, args, promiseID: id });
      });
    },
    setMessageHandler: function (handler: () => void): void {
      messageHandler = handler;
    },
  };

  channel.port1.onmessage = (event: MessageEvent): void => {
    const msg = event.data;

    if (!msg) return;

    if (msg.promiseID != null) {
      const pendingPromise = pendingPromises.get(msg.promiseID);

      if (pendingPromise) {
        pendingPromises.delete(msg.promiseID);
        if ("result" in msg) {
          pendingPromise.resolve(msg.result);
        } else {
          console.error(`Pending Promise (id: "${msg.promiseID}") reject via error: `, msg.error);
          pendingPromise.reject(msg.error);
        }
      }
    } else if (msg.callbackID != null) {
      const registeredCallback = registeredCallbacks.get(msg.callbackID);
      if (registeredCallback) {
        registeredCallback(msg.args);
      } else {
        if (import.meta.env.DEV) console.warn("[webBinding] callback missing:", msg);
      }
    } else if (msg.name != null) {
      messageHandler(msg.name, msg.args);
    }
  };

  window.postMessage("init", location.origin, [channel.port2]);
};

const initWebBindings = (): void => {
  E.ipcRenderer.on("newFile", () => {
    webPort.postMessage({ name: "newFile", args: {} });
  });
  E.ipcRenderer.on("handleAction", (_: IpcRendererEvent, action: string, source: string) => {
    webPort.postMessage({ name: "handleAction", args: { action, source } });
  });
  E.ipcRenderer.on("handleUrl", (_: IpcRendererEvent, path: string, params: string) => {
    webPort.postMessage({ name: "handleUrl", args: { path, params } });
  });
  E.ipcRenderer.on("handleSetFullScreen", (event: IpcRendererEvent, fullscreen: boolean) => {
    webPort.postMessage({ name: "handleSetFullScreen", args: { fullscreen } });
  });
  E.ipcRenderer.on("showFlashMessage", (event: IpcRendererEvent, flashErrorMessage: string) => {
    webPort.postMessage({
      name: "showFlashMessage",
      args: { flashErrorMessage },
    });
  });
  E.ipcRenderer.on("handlePageCommand", (_: IpcRendererEvent, command: string) => {
    webPort.postMessage({
      name: "handlePageCommand",
      args: { pageCommand: command, source: "os-menu" },
    });
  });

  E.ipcRenderer.on("redeemAppAuth", (event: IpcRendererEvent, gSecret: string) => {
    webPort.postMessage({ name: "redeemAppAuth", args: { gSecret } });
  });

  E.ipcRenderer.on("handlePluginMenuAction", (event: IpcRendererEvent, pluginMenuAction: any) => {
    webPort.postMessage({ name: "handlePluginMenuAction", args: { pluginMenuAction } });
  });
};

function keydownHandler(event: KeyboardEvent) {
  const url = location.href;
  if (
    event.code === "F11" &&
    (isValidProjectLink(url) || isValidFigjamLink(url) || isPrototypeUrl(url))
  ) {
    E.ipcRenderer.send("toggleCurrentWindowFullscreen");
  }
}

const publicAPI: any = {
  setTitle(args: WebApi.SetTitleArgs) {
    sendMsgToMain("setTitle", args.title);
  },

  setUser(args: WebApi.SetUser) {
    sendMsgToMain("setUser", args.id);
  },
  setUsingMicrophone(args: WebApi.SetUsingMic) {
    sendMsgToMain("setUsingMicrophone", args.isUsingMicrophone);
  },
  setIsInVoiceCall(args: WebApi.SetIsInVoiceCall) {
    sendMsgToMain("setIsInVoiceCall", args.isInVoiceCall);
  },

  addTabAnalyticsMetadata(args: any) {
    // sendMsgToMain("addTabAnalyticsMetadata", args.isUsingMicrophone);
    console.log("Method addTabAnalyticsMetadata not implemented, args: ", args);
  },
  async requestMicrophonePermission() {
    let granted = false;

    try {
      await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      granted = true;
    } catch (_) {
      granted = false;
    }

    return { data: granted };
  },
  async setMediaEnabled(args: any) {
    return true;
  },

  newFile(args: any) {
    sendMsgToMain("newFile", args.info);
  },
  // TODO: need update
  openFile(args: any) {
    sendMsgToMain("openFile", "/file/" + args.fileKey, args.title, undefined, args.target);
  },
  openFileFromNewTab(args: any) {
    if (args.url) {
      const u = new URL(args.url);
      sendMsgToMain("openFile", u.pathname + u.search, args.title, undefined, args.target ?? "tab");
    } else {
      sendMsgToMain(
        "openFile",
        "/file/" + args.fileKey,
        args.title,
        undefined,
        args.target ?? "tab",
      );
    }
  },
  openCommunity(args: WebApi.OpenCommunity) {
    sendMsgToMain("openCommunity", args);
  },
  openPrototype(args: any) {
    sendMsgToMain(
      "openFile",
      "/proto/" + args.fileKey,
      args.title,
      "?node-id=" + args.pageId,
      args.target,
    );
  },

  async createFile(args: WebApi.CreateFile) {
    const result = await E.ipcRenderer.invoke("createFile", args);

    return { data: result };
  },
  close(args: any) {
    sendMsgToMain("closeTab", args.suppressReopening);
  },
  setLoading(args: WebApi.SetLoading) {
    sendMsgToMain("setLoading", args);
  },
  setSaved(args: any) {
    sendMsgToMain("updateSaveStatus", args.saved);
  },
  updateFullscreenMenuState(args: any) {
    sendMsgToMain("updateFullscreenMenuState", args.state);
  },
  showFileBrowser() {
    sendMsgToMain("showFileBrowser");
  },
  setIsPreloaded() {
    sendMsgToMain("setIsPreloaded");
  },
  // Real-time collaboration — not applicable on Linux desktop
  initLivegraph(_args: any) {},
  setThemePreference(args: any) {
    const theme = args?.theme ?? args?.colorScheme ?? args;
    sendMsgToMain("setFigmaTheme", theme);
  },

  // Fire-and-forget messages that don't need main-process handling yet.
  // In dev mode they log args so you can inspect the payload for future feature implementation.
  setEditorType(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setEditorType", args);
  },
  setRealtimeToken(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setRealtimeToken", args);
  },
  setLocales(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setLocales", args);
  },
  setTabPreviewData(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setTabPreviewData", args);
  },
  setIsLibrary(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setIsLibrary", args);
  },
  setIsTeamTemplate(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setIsTeamTemplate", args);
  },
  updateColorProfile(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] updateColorProfile", args);
  },
  setEditFilePermissions(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] setEditFilePermissions", args);
  },
  updateViewport(args: any) {
    if (import.meta.env.DEV) console.debug("[stub] updateViewport", args);
  },
  setTabColor(args: any) {
    sendMsgToMain("setTabColor", args);
  },

  // Returns current screen(s) dimensions — used by Figma for modal/popup positioning
  getActiveNSScreens() {
    return Promise.resolve({
      data: [
        {
          frame: { x: 0, y: 0, width: window.screen.width, height: window.screen.height },
          visibleFrame: {
            x: 0,
            y: 0,
            width: window.screen.availWidth,
            height: window.screen.availHeight,
          },
          scaleFactor: window.devicePixelRatio ?? 1,
        },
      ],
    });
  },

  // Returns keyboard layout type — used by Figma for shortcut key labels
  getKeyboardLayout() {
    return Promise.resolve({ data: "ANSI" });
  },

  // Returns available spell-check languages
  spellingGetLanguages() {
    return Promise.resolve({ data: [navigator.language] });
  },
  setInitialOptions(args: WebApi.SetInitOptions) {
    sendMsgToMain("setInitialOptions", args);
  },
  setTheme(args: any) {
    sendMsgToMain("setFigmaTheme", args.theme ?? args);
  },

  setFeatureFlags(args: any) {
    sendMsgToMain("setFeatureFlags", args);
  },
  startAppAuth(args: any) {
    sendMsgToMain("startAppAuth", args);
  },
  finishAppAuth(args: any) {
    sendMsgToMain("finishAppAuth", args);
  },
  openDevTools(args: { mode: string }) {
    sendMsgToMain("openDevTools", args.mode);
  },

  setAuthedUsers(args: WebApi.SetAuthedUsers) {
    sendMsgToMain("setAuthedUsers", args.userIDs);
  },
  setWorkspaceName(args: WebApi.SetWorkspaceName) {
    sendMsgToMain("setWorkspaceName", args.name);
  },
  setFigjamEnabled(args: WebApi.SetFigjamEnabled) {
    sendMsgToMain("setFigjamEnabled", args.figjamEnabled);
  },
  getZoomFactor() {
    return Promise.resolve({ data: E.webFrame.getZoomFactor() });
  },

  async writeNewExtensionDirectoryToDisk(args: WebApi.WriteNewExtensionDirectoryToDisk) {
    const data = await E.ipcRenderer.invoke("writeNewExtensionDirectoryToDisk", args);

    return { data };
  },
  async getLocalManifestFileExtensionIdsToCachedMetadataMap() {
    const data = await E.ipcRenderer.invoke("getLocalManifestFileExtensionIdsToCachedMetadataMap");

    return { data };
  },

  async createMultipleNewLocalFileExtensions(args: WebApi.CreateMultipleExtension) {
    const result = await E.ipcRenderer.invoke("createMultipleNewLocalFileExtensions", args);

    return { data: result };
  },
  async getAllLocalManifestFileExtensionIds() {
    const result = await E.ipcRenderer.invoke("getAllLocalFileExtensionIds");
    return { data: result };
  },
  async getLocalFileExtensionManifest(args: WebApi.ExtensionId) {
    const manifest = await E.ipcRenderer.invoke("getLocalFileExtensionManifest", args);
    return { data: manifest };
  },
  async getLocalFileExtensionSource(args: WebApi.ExtensionId) {
    const source = await E.ipcRenderer.invoke("getLocalFileExtensionSource", args);
    return { data: source };
  },
  removeLocalFileExtension(args: WebApi.ExtensionId) {
    E.ipcRenderer.send("removeLocalFileExtension", args);
  },
  openExtensionDirectory(args: WebApi.ExtensionId) {
    E.ipcRenderer.send("openExtensionDirectory", args);
  },
  openExtensionManifest(args: WebApi.ExtensionId) {
    E.ipcRenderer.send("openExtensionDirectory", args);
  },
  async writeNewExtensionToDisk(args: WebApi.WriteNewExtensionToDiskArgs) {
    const extId = await E.ipcRenderer.invoke("writeNewExtensionToDisk", args);
    return { data: extId };
  },

  async isDevToolsOpened() {
    const isOpened = await E.ipcRenderer.invoke("isDevToolsOpened");

    return { data: isOpened };
  },

  async getFonts(args: WebApi.GetFonts) {
    const fonts = await E.ipcRenderer.invoke("getFonts");
    return { data: fonts };
  },

  async getModifiedFonts(args: WebApi.GetFonts) {
    const fonts = await E.ipcRenderer.invoke("getFonts");
    return { data: fonts };
  },

  async getFontsModifiedAt(args: WebApi.GetFonts) {
    const fonts = await E.ipcRenderer.invoke("getFonts");
    return { data: fonts };
  },

  async getFontFile(args: WebApi.GetFontFile) {
    const fontBuffer = await E.ipcRenderer.invoke("getFontFile", args);

    return { data: fontBuffer, transferList: [fontBuffer] };
  },

  getClipboardData(args: any) {
    return new Promise((resolve, reject) => {
      if (E.clipboard.has("org.nspasteboard.ConcealedType")) {
        sendMsgToMain("logError", "Clipboard unavailable");
        reject(new Error("Clipboard unavailable"));
        return;
      }

      const whitelistedFormats = ["com.adobe.pdf", "com.adobe.xd", "com.bohemiancoding.sketch.v3"];

      const formats = args.getArray("formats");

      for (const format of formats) {
        let data = null;

        if (format === "text/html") {
          const unsafeHTML = E.clipboard.readHTML().trim();

          if (unsafeHTML.includes("<!--(figma)") && unsafeHTML.includes("(/figma)-->")) {
            data = Buffer.from(unsafeHTML);
          }
        } else if (format === "image/svg+xml") {
          data = E.clipboard.readBuffer(format);
          data = data.byteLength > 0 ? data : E.clipboard.readBuffer("Scalable Vector Graphics");
          data =
            data.byteLength > 0
              ? data
              : E.clipboard.readBuffer("CorePasteboardFlavorType 0x53564720");

          if (data.byteLength === 0) {
            const unsafeText = E.clipboard.readText().trim();
            if (unsafeText.startsWith("<svg") && unsafeText.endsWith("</svg>")) {
              data = Buffer.from(unsafeText);
            }
          }
        } else if (format === "image/jpeg" || format === "image/png") {
          data = E.clipboard.readImage().toBitmap();
        } else if (whitelistedFormats.indexOf(format) !== -1) {
          data = E.clipboard.readBuffer(format);
        }

        if (data && data.byteLength > 0) {
          const result = {
            data: data.buffer,
            format: format,
          };

          resolve({ data: result, transferList: [data.buffer] });
          return;
        }
      }

      sendMsgToMain("logError", "Formats not found. Formats: ", formats);
      reject(new Error("Formats not found"));
    });
  },

  setClipboardData(args: WebApi.SetClipboardData) {
    E.ipcRenderer.send("setClipboardData", args);
  },

  async writeFiles(args: WebApi.WriteFiles) {
    await E.ipcRenderer.invoke("writeFiles", args);
  },
};

const init = (fileBrowser: boolean): void => {
  window.addEventListener(
    "message",
    (event) => {
      if (event.data !== "init" || !event.ports || !event.ports.length) {
        return;
      }

      webPort = event.ports[0];
      webPort.onmessage = onWebMessage;
    },
    { once: true },
  );

  const initWebOptions: IntiApiOptions = {
    version: API_VERSION,
    appVersion: APP_VERSION,
    fileBrowser: fileBrowser,
  };

  initWebBindings();

  E.webFrame.executeJavaScript(`(${initWebApi.toString()})(${JSON.stringify(initWebOptions)})`);

  document.addEventListener("keydown", keydownHandler);
};

export default init;
