/**
 * types.ts — Shared type definitions for the MCP server.
 *
 * Extracted from McpServer.ts. `FigmaViewProvider` is re-exported through the
 * MCP barrel (index.ts) and consumed by App.ts.
 */

import type http from "node:http";
import type { WebContentsView } from "electron";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpSession {
  id: string;
  createdAt: number;
  lastActivity: number;
  sseResponse: http.ServerResponse | null;
  clientInfo?: { name: string; version: string };
}

/**
 * Every MCP tool the server implements. This union is the single source of
 * truth: the tool definitions (tools/definitions.ts) and the dispatch table
 * (McpServer.dispatchTool) are both keyed by it, so tsc flags any drift —
 * an advertised tool with no handler, or a handler for an unadvertised name.
 */
export type ToolName =
  | "get_design_context"
  | "get_metadata"
  | "get_file_info"
  | "get_screenshot"
  | "get_variable_defs"
  | "get_code_connect_map"
  | "add_code_connect_map"
  | "create_design_system_rules"
  | "get_figjam"
  | "generate_diagram"
  | "search_design_system"
  | "figma_find"
  | "figma_tree"
  | "use_figma"
  | "create_new_file"
  | "figma_text";

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AssetEntry {
  data: Buffer;
  contentType: string;
}

export interface CodeConnectEntry {
  nodeId: string;
  codeConnectSrc: string;
  codeConnectName: string;
}

/** Minimal interface for querying the Figma BrowserView.
 *  Matches figma-linux-next Window class public surface. */
export interface FigmaViewProvider {
  /** Execute arbitrary JS in the active Figma tab's webContents. */
  executeInBrowserView(script: string): Promise<any>;
  /** Get the active tab's WebContentsView (for capturePage). */
  getActiveTabView(): WebContentsView | null;
  /** Get the URL of the currently focused tab. */
  getActiveTabUrl(): string | null;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}
