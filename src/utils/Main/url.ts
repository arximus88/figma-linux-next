import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const panelUrlDev = `http://localhost:${process.env.DEV_PANEL_PORT ?? "5173/index.html"}`;
export const settingsUrlDev = `http://localhost:${process.env.DEV_SETTINGS_PORT ?? "5173/settings.html"}`;

export const panelUrlProd = `file://${resolve(__dirname, "../index.html")}`;
export const settingsUrlProd = `file://${resolve(__dirname, "../settings.html")}`;

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
  return /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com)/.test(url);
};
