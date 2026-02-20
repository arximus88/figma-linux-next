import { resolve } from "path";

export const panelUrlDev = `http://localhost:${process.env.DEV_PANEL_PORT ?? "5173/src/index.html"}`;
export const settingsUrlDev = `http://localhost:${process.env.DEV_SETTINGS_PORT ?? "5173/src/settings.html"}`;

export const panelUrlProd = `file://${resolve(__dirname, "../index.html")}`;
export const settingsUrlProd = `file://${resolve(__dirname, "../settings.html")}`;

export const preloadMainScriptPathDev = `${resolve(
  process.cwd(),
  "dist/renderer",
  "loadMainContent.js",
)}`;
export const preloadMainScriptPathProd = `${resolve(
  __dirname,
  "..",
  "renderer",
  "loadMainContent.js",
)}`;
export const preloadScriptPathDev = `${resolve(process.cwd(), "dist/renderer", "loadContent.js")}`;
export const preloadScriptPathProd = `${resolve(__dirname, "..", "renderer", "loadContent.js")}`;

export const bridgePreloadPathDev = `${resolve(process.cwd(), "dist/renderer", "bridge.js")}`;
export const bridgePreloadPathProd = `${resolve(__dirname, "..", "renderer", "bridge.js")}`;

export const isFigmaValidUrl = (url: string): boolean => {
  return /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com)/.test(url);
};
