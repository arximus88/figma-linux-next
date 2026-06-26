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

export interface ToolDefinition {
  name: string;
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
