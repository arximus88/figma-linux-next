/**
 * config.ts — MCP server configuration constants and default logger.
 *
 * Extracted from McpServer.ts to keep the orchestrator slim.
 */

import { version as APP_VERSION } from "../../../package.json";
import type { Logger } from "./types";

// ── Configuration ──────────────────────────────────────────────────────────────

export const MCP_PORT = 3845;
export const MCP_HOST = "127.0.0.1";
export const SERVER_NAME = "figma-linux-next";
export const SERVER_VERSION = APP_VERSION;
export const PROTOCOL_VERSION = "2025-03-26";

// ── Logger (default console-backed implementation) ─────────────────────────────

export const defaultLogger: Logger = {
  info: (...args) => console.log("[MCP]", ...args),
  warn: (...args) => console.warn("[MCP]", ...args),
  error: (...args) => console.error("[MCP]", ...args),
  debug: (...args) => console.debug("[MCP]", ...args),
};
