/**
 * Preload Bridge
 * Exposes a typed `window.figmaApi` for the Panel and Settings renderers.
 * This replaces direct `import { ipcRenderer } from "electron"` access.
 *
 * Security: contextBridge ensures only whitelisted channels are accessible.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

/**
 * Allowed IPC channels — only these can be sent/received through the bridge.
 * Adding a new channel requires updating this list.
 */
const SEND_CHANNELS = [
  // Panel
  "frontReady",
  "openMainMenu",
  "windowClose",
  "windowMinimize",
  "windowMaximize",
  "closeTab",
  "setTabFocus",
  "setFocusToMainTab",
  "openMainTabMenu",
  "setFocusToCommunityTab",
  "closeCommunityTab",
  "openCommunityTabMenu",
  "newProject",
  "openTabMenu",
  // Settings
  "closeSettingsView",
  "setFrameStyle",
  "openSettingsView",
  // Changelog
  "openChangelogView",
  "closeChangelogView",
  "openExternal",
  // Tab metadata (from Figma web app via DesktopAPI relay)
  "setTabEditorType",
  "setTabIsLibrary",
  "setTabUrl",
] as const;

const RECEIVE_CHANNELS = [
  // Panel
  "closeAllTabs",
  "didTabAdd",
  "setTitle",
  "setTabType",
  "tabWasClosed",
  "focusTab",
  "newFileBtnVisible",
  "setUsingMicrophone",
  "setIsInVoiceCall",
  "isMainMenuOpen",
  "setPanelScale",
  "loadSettings",
  "openCommunity",
  "communityTabWasClose",
  "setLoading",
  "frameStyleChanged",
] as const;

const INVOKE_CHANNELS = [
  "getSettings",
  "selectExportDirectory",
  "updateFigmaUiScale",
  "updatePanelScale",
] as const;

type SendChannel = (typeof SEND_CHANNELS)[number];
type ReceiveChannel = (typeof RECEIVE_CHANNELS)[number];
type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

const api = {
  /**
   * Send a fire-and-forget message to the main process
   */
  send(channel: SendChannel, ...args: any[]) {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  /**
   * Send a request and await the response from the main process
   */
  invoke(channel: InvokeChannel, ...args: any[]): Promise<any> {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel "${channel}" is not allowed`));
  },

  /**
   * Listen for messages from the main process.
   * Returns an unsubscribe function.
   */
  on(channel: ReceiveChannel, listener: (...args: any[]) => void): () => void {
    if (!RECEIVE_CHANNELS.includes(channel)) {
      return () => {};
    }

    const handler = (_event: IpcRendererEvent, ...args: any[]) => listener(...args);
    ipcRenderer.on(channel, handler);

    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },

  /**
   * Listen for a message from the main process, once only.
   */
  once(channel: ReceiveChannel, listener: (...args: any[]) => void): void {
    if (!RECEIVE_CHANNELS.includes(channel)) {
      return;
    }

    ipcRenderer.once(channel, (_event: IpcRendererEvent, ...args: any[]) => listener(...args));
  },
};

contextBridge.exposeInMainWorld("figmaApi", api);
