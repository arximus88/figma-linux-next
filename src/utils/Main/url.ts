import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * A renderer page on the Vite dev server. The address comes from
 * vite-plugin-electron, which sets VITE_DEV_SERVER_URL to where the server
 * actually listens before it starts Electron. Vite moves to the next free
 * port when 5173 is taken — by any other project's dev server — so a
 * hard-coded port loads someone else's app.
 */
export function devPageUrl(page: string, serverUrl = process.env.VITE_DEV_SERVER_URL): string {
  return new URL(page, serverUrl || "http://localhost:5173/").toString();
}

export const panelUrlDev = devPageUrl("index.html");
export const settingsUrlDev = devPageUrl("settings.html");
export const changelogUrlDev = devPageUrl("changelog.html");
export const previewUrlDev = devPageUrl("preview.html");
export const groupPromptUrlDev = devPageUrl("groupPrompt.html");

export const panelUrlProd = `file://${resolve(__dirname, "../index.html")}`;
export const settingsUrlProd = `file://${resolve(__dirname, "../settings.html")}`;
export const changelogUrlProd = `file://${resolve(__dirname, "../changelog.html")}`;
export const previewUrlProd = `file://${resolve(__dirname, "../preview.html")}`;
export const groupPromptUrlProd = `file://${resolve(__dirname, "../groupPrompt.html")}`;

export const preloadMainScriptPathDev = `${resolve(
  __dirname,
  "../renderer",
  "loadMainContent.js",
)}`;
export const preloadMainScriptPathProd = `${resolve(
  __dirname,
  "../renderer",
  "loadMainContent.js",
)}`;
export const preloadScriptPathDev = `${resolve(__dirname, "../renderer", "loadContent.js")}`;
export const preloadScriptPathProd = `${resolve(__dirname, "../renderer", "loadContent.js")}`;

export const bridgePreloadPathDev = `${resolve(__dirname, "../renderer", "bridge.js")}`;
export const bridgePreloadPathProd = `${resolve(__dirname, "../renderer", "bridge.js")}`;

export const isFigmaValidUrl = (url: string): boolean => {
  return /^(figma:\/\/|https?:\/\/(w{0,3}\.)?figma\.com)/.test(url);
};
