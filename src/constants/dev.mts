/**
 * Sent by the Electron main process to the Vite dev server (over the IPC
 * channel vite-plugin-electron opens) to be restarted — see App.relaunchApp
 * and vite.config.mts. An .mts file so vite.config can import it natively
 * (Node treats .ts as CommonJS here: the root package.json has no "type").
 */
export const DEV_RELAUNCH_MESSAGE = "figma-linux-next:relaunch";
