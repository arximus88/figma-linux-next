/**
 * McpServer.ts — Figma MCP Server for figma-linux-next
 *
 * Implements the MCP protocol (JSON-RPC 2.0 over Streamable HTTP) directly,
 * without the @modelcontextprotocol/sdk. Zero external dependencies.
 *
 * Implements the open MCP specification to provide Figma design context to
 * AI coding assistants. Built for figma-linux-next where we do NOT control the
 * Figma webapp renderer. Instead we use:
 *   - webContents.executeJavaScript() for querying the Figma Plugin API
 *   - webContents.capturePage() for screenshots
 *
 * Exposes:
 *   POST /mcp   — Streamable HTTP transport (MCP spec 2025-03-26)
 *   GET  /mcp   — SSE stream for server→client notifications
 *   GET  /sse   — Legacy SSE transport (deprecated)
 *   POST /messages — Legacy SSE message endpoint
 *   GET  /assets/:id — Exported images
 */

import http from "node:http";
import crypto from "node:crypto";
import {
  defaultLogger,
  MCP_HOST,
  MCP_PORT,
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
} from "./config";
import { ToolHandlers } from "./handlers/ToolHandlers";
import type {
  AssetEntry,
  CodeConnectEntry,
  FigmaViewProvider,
  JsonRpcRequest,
  JsonRpcResponse,
  Logger,
} from "./types";
import { TOOLS, WRITE_TOOLS } from "./tools/definitions";
import { SessionManager } from "./transport/SessionManager";
import { collectBody, cors, isValidHost, replyError } from "./utils/http";
import { toolError } from "./utils/toolResponse";

// ── McpServer Class ────────────────────────────────────────────────────────────

export class McpServer {
  private server: http.Server | null = null;
  private sessions: SessionManager;
  private codeConnectMap = new Map<string, CodeConnectEntry>();
  private assetStore = new Map<string, AssetEntry>();
  private log: Logger;
  private viewProvider: FigmaViewProvider | null = null;
  private handlers: ToolHandlers | null = null;
  private _isRunning = false;
  private _writeToolsEnabled = false;

  constructor(log?: Logger) {
    this.log = log ?? defaultLogger;
    this.sessions = new SessionManager(this.log);
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  /** Set the provider that gives us access to the Figma webContents. */
  public setViewProvider(provider: FigmaViewProvider): void {
    this.viewProvider = provider;
    this.handlers = new ToolHandlers({
      viewProvider: provider,
      log: this.log,
      codeConnectMap: this.codeConnectMap,
      assetStore: this.assetStore,
    });
    this.log.info("View provider attached");
  }

  /** Enable or disable write tools and notify connected clients. */
  public setWriteToolsEnabled(enabled: boolean): void {
    if (this._writeToolsEnabled === enabled) return;
    this._writeToolsEnabled = enabled;
    this.log.info(`MCP write tools ${enabled ? "enabled" : "disabled"}`);

    // Send tools/list_changed notification to all active SSE sessions
    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
    });
    for (const session of this.sessions.values()) {
      if (session.sseResponse && !session.sseResponse.destroyed) {
        try {
          session.sseResponse.write(`event: message\ndata: ${notification}\n\n`);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Start the HTTP server. */
  public start(port = MCP_PORT, host = MCP_HOST): Promise<{ didStart: boolean; port: number }> {
    if (this._isRunning) {
      this.log.info("MCP server already running");
      return Promise.resolve({ didStart: true, port });
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          this.log.warn(`Port ${port} already in use — MCP server not started`);
          resolve({ didStart: false, port });
        } else {
          this.log.error("Server error:", err);
          resolve({ didStart: false, port });
        }
      });

      this.server.listen(port, host, () => {
        this._isRunning = true;
        this.log.info(`MCP server running at http://${host}:${port}/mcp`);
        this.sessions.startReaper();
        resolve({ didStart: true, port });
      });
    });
  }

  /** Stop the HTTP server and clean up all sessions. */
  public stop(): void {
    this.sessions.shutdown();

    if (this.server) {
      this.server.close();
      this.server = null;
      this._isRunning = false;
      this.log.info("MCP server stopped");
    }
  }

  // ── HTTP Handler ───────────────────────────────────────────────────────────

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Host header validation (standard localhost security)
    const host = req.headers.host;
    if (!host || !isValidHost(host)) {
      this.log.error("Access denied — invalid Host header:", host);
      res.writeHead(403);
      res.end("Access denied — invalid Host header");
      return;
    }

    // Standard security headers
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // CORS for preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors());
      res.end();
      return;
    }

    // Asset serving — GET /assets/:id
    if (req.method === "GET" && req.url?.startsWith("/assets/")) {
      this.handleAssetRequest(req, res);
      return;
    }

    // MCP endpoint
    if (req.url === "/mcp") {
      await this.handleMcpEndpoint(req, res);
      return;
    }

    // Legacy SSE endpoint
    if (req.url === "/sse" && req.method === "GET") {
      this.handleSseConnect(req, res);
      return;
    }

    // Legacy SSE message endpoint
    if (req.url?.startsWith("/messages") && req.method === "POST") {
      await this.handleSseMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify({ error: "not found" }));
  }

  // ── Streamable HTTP Transport (/mcp) ─────────────────────────────────────

  private async handleMcpEndpoint(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "GET") {
      // SSE stream for server→client notifications (session required)
      if (!sessionId || !this.sessions.has(sessionId)) {
        replyError(res, 400, -32001, "No valid session", null);
        return;
      }
      const session = this.sessions.get(sessionId)!;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...cors(),
      });
      session.sseResponse = res;
      req.on("close", () => {
        session.sseResponse = null;
      });
      return;
    }

    // DELETE → terminate session (MCP spec 2025-03-26)
    if (req.method === "DELETE") {
      if (sessionId && this.sessions.has(sessionId)) {
        const s = this.sessions.get(sessionId)!;
        if (s.sseResponse) {
          try {
            s.sseResponse.end();
          } catch {
            /* ignore */
          }
        }
        this.sessions.delete(sessionId);
        this.log.info("Session terminated by client:", sessionId);
      }
      res.writeHead(200, cors());
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, cors());
      res.end();
      return;
    }

    // Parse request body
    let body: JsonRpcRequest;
    try {
      const raw = await collectBody(req);
      body = JSON.parse(raw);
    } catch {
      replyError(res, 400, -32700, "Parse error", null);
      return;
    }

    // Notifications need no response
    if (body.method?.startsWith("notifications/")) {
      res.writeHead(202, cors());
      res.end();
      return;
    }

    // No session → must be initialize
    if (!sessionId) {
      if (body.method !== "initialize") {
        replyError(res, 400, -32000, "Must initialize first", body.id ?? null);
        return;
      }
      const newSessionId = crypto.randomUUID();
      const now = Date.now();
      this.sessions.set({
        id: newSessionId,
        createdAt: now,
        lastActivity: now,
        sseResponse: null,
        clientInfo: body.params?.clientInfo as any,
      });

      this.log.info(
        "New session initialized:",
        newSessionId,
        "client:",
        (body.params?.clientInfo as any)?.name,
      );

      const result: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Mcp-Session-Id": newSessionId,
        ...cors(),
      });
      res.end(JSON.stringify(result));
      return;
    }

    // With session → route the request
    if (!this.sessions.has(sessionId)) {
      replyError(res, 404, -32002, "Session not found", body.id ?? null);
      return;
    }

    // Touch last-activity so the TTL reaper doesn't evict active sessions
    this.sessions.touch(sessionId);

    const response = await this.handleJsonRpc(body);
    res.writeHead(200, { "Content-Type": "application/json", ...cors() });
    res.end(JSON.stringify(response));
  }

  // ── Legacy SSE Transport (/sse + /messages) ──────────────────────────────

  private handleSseConnect(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = crypto.randomUUID();

    this.sessions.set({
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      sseResponse: res,
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...cors(),
    });

    // Send endpoint event per SSE transport spec
    res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch {
        clearInterval(keepAlive);
        this.sessions.delete(sessionId);
      }
    }, 30_000);

    _req.on("close", () => {
      clearInterval(keepAlive);
      this.sessions.delete(sessionId);
      this.log.info("SSE session closed:", sessionId);
    });

    this.log.info("SSE session connected:", sessionId);
  }

  private async handleSseMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify({ error: "Invalid sessionId" }));
      return;
    }

    let body: JsonRpcRequest;
    try {
      const raw = await collectBody(req);
      body = JSON.parse(raw);
    } catch {
      replyError(res, 400, -32700, "Parse error", null);
      return;
    }

    // Process the request
    const response = await this.handleJsonRpc(body);

    // Send response over SSE stream
    const session = this.sessions.get(sessionId)!;
    if (session.sseResponse && !session.sseResponse.destroyed) {
      session.sseResponse.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    // Acknowledge the POST
    res.writeHead(202, cors());
    res.end();
  }

  // ── JSON-RPC dispatcher ──────────────────────────────────────────────────

  private async handleJsonRpc(msg: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = msg.id ?? null;

    switch (msg.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        };

      case "tools/list": {
        const allTools = this._writeToolsEnabled ? [...TOOLS, ...WRITE_TOOLS] : TOOLS;
        return { jsonrpc: "2.0", id, result: { tools: allTools } };
      }

      case "tools/call": {
        const toolName = msg.params?.name as string;
        const toolArgs = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        const result = await this.dispatchTool(toolName, toolArgs);
        return { jsonrpc: "2.0", id, result };
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        };
    }
  }

  // ── Tool Dispatch ────────────────────────────────────────────────────────

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.viewProvider || !this.handlers) {
      return toolError("No Figma window open — open a file first");
    }
    const h = this.handlers;

    try {
      switch (name) {
        case "get_design_context":
          return await h.toolGetDesignContext(args);
        case "get_metadata":
          return await h.toolGetMetadata(args);
        case "get_file_info":
          return await h.toolGetFileInfo();
        case "get_screenshot":
          return await h.toolGetScreenshot(args);
        case "get_variable_defs":
          return await h.toolGetVariableDefs(args);
        case "get_code_connect_map":
          return h.toolGetCodeConnectMap();
        case "add_code_connect_map":
          return h.toolAddCodeConnectMap(args);
        case "create_design_system_rules":
          return await h.toolCreateDesignSystemRules(args);
        case "get_figjam":
          return await h.toolGetFigjam(args);
        case "generate_diagram":
          return await h.toolGenerateDiagram(args);
        case "search_design_system":
          return await h.toolSearchDesignSystem(args);
        case "use_figma":
          if (!this._writeToolsEnabled)
            return toolError(
              "Write tools are disabled. Enable them in Settings → General → MCP Server.",
            );
          return await h.toolUseFigma(args);
        case "create_new_file":
          if (!this._writeToolsEnabled)
            return toolError(
              "Write tools are disabled. Enable them in Settings → General → MCP Server.",
            );
          return await h.toolCreateNewFile(args);
        default:
          return toolError(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      this.log.error(`Tool error (${name}):`, err?.message ?? err);
      return toolError(err?.message ?? String(err));
    }
  }

  // ── Asset Serving ────────────────────────────────────────────────────────

  private handleAssetRequest(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const assetId = _req.url!.slice("/assets/".length);
    const asset = this.assetStore.get(assetId);

    if (!asset) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Asset not found" }));
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.data.length),
      "Cache-Control": "no-cache, no-store",
    };

    res.writeHead(200, headers);
    res.end(asset.data);
  }
}
