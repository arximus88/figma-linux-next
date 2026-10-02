/**
 * Sent by the Electron main process to the Vite dev server (over the IPC
 * channel vite-plugin-electron opens) to be restarted — see App.relaunchApp
 * and vite.config.mts. A plain module so vite.config can import it too.
 */
export const DEV_RELAUNCH_MESSAGE = "figma-linux-next:relaunch";
