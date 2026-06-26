/**
 * Helpers for webBinding.ts — runs in MainTab preload context.
 * MainTab uses contextIsolation: false, so window.figmaApi does NOT exist.
 * We use ipcRenderer directly here (available via the preload script).
 */
import { ipcRenderer } from "electron";

export const sendMsgToMain = (msg: string, ...data: any[]) => {
  ipcRenderer.send(msg, ...data);
};

export const registerCallbackWithMainProcess = (() => {
  let nextCallbackID = 0;
  const registeredCallbacks = new Map();

  ipcRenderer.on("handleCallback", (_event: any, callbackID: number, result: any) => {
    const registeredCallback = registeredCallbacks.get(callbackID);
    if (registeredCallback) {
      registeredCallback(result);
    } else {
      console.error("[desktop] unexpected callback", callbackID);
    }
  });

  return (channel: string, args: any, callback: (result: any) => void) => {
    const callbackID = nextCallbackID++;
    registeredCallbacks.set(callbackID, callback);

    ipcRenderer.send(`web-callback:${channel}`, callbackID, args);

    return () => {
      ipcRenderer.send("web-cancel-callback", callbackID);
      registeredCallbacks.delete(callbackID);
    };
  };
})();
