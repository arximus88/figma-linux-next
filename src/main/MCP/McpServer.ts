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
import { app } from "electron";
import { storage } from "Main/Storage";
import { ToolHandlers } from "./handlers/ToolHandlers";
import type {
  AssetEntry,
  CodeConnectEntry,
  FigmaViewProvider,
  JsonRpcRequest,
  JsonRpcResponse,
  Logger,
  ToolName,
} from "./types";
import { AI_TOOLS, TOOLS, WRITE_TOOLS } from "./tools/definitions";
import { SessionManager } from "./transport/SessionManager";
import {
  collectBody,
  collectBytes,
  cors,
  isAllowedOrigin,
  isValidHost,
  replyError,
} from "./utils/http";
import { UPLOAD_MAX_BYTES, type UploadTicket } from "./utils/uploads";
import { readFileKeyArg } from "./utils/fileKey";
import { toolError } from "./utils/toolResponse";

// ── McpServer Class ────────────────────────────────────────────────────────────

export class McpServer {
  private server: http.Server | null = null;
  private sessions: SessionManager;
  private codeConnectMap = new Map<string, CodeConnectEntry>();
  private assetStore = new Map<string, AssetEntry>();
  private uploads = new Map<string, UploadTicket>();
  private editorWaitFailures = new Map<string, number>();
  private log: Logger;
  private viewProvider: FigmaViewProvider | null = null;
  private handlers: ToolHandlers | null = null;
  private _isRunning = false;
  private _writeToolsEnabled = false;
  private _aiToolsEnabled = false;
  private _boundPort = MCP_PORT;

  constructor(log?: Logger) {
    this.log = log ?? defaultLogger;
    this.sessions = new SessionManager(this.log);
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  /** Runtime status for the settings UI: is the listener up, and on which port. */
  public getStatus(): { listening: boolean; port: number } {
    return { listening: this._isRunning, port: this._boundPort };
  }

  /** Set the provider that gives us access to the Figma webContents. */
  public setViewProvider(provider: FigmaViewProvider): void {
    this.viewProvider = provider;
    this.handlers = this.makeHandlers(provider);
    this.log.info("View provider attached");
  }

  private makeHandlers(provider: FigmaViewProvider, fileKey?: string): ToolHandlers {
    return new ToolHandlers({
      viewProvider: provider,
      uploads: this.uploads,
      editorWaitFailures: this.editorWaitFailures,
      fileKey,
      log: this.log,
      codeConnectMap: this.codeConnectMap,
      assetStore: this.assetStore,
      getPort: () => this._boundPort,
      // exportDir, not lastExportDir: the last export folder moves every time
      // the user exports something, and the same relative path would land in
      // a different place from one call to the next.
      getSaveBaseDir: () => storage.settings.app.exportDir || app.getPath("pictures"),
    });
  }

  /**
   * Handlers bound to the tab that shows `fileKey` instead of the active tab.
   * Built per call: the provider resolves the tab at execution time, so a
   * file opened or closed between calls is seen as it is now.
   */
  private handlersFor(fileKey: string): ToolHandlers {
    const base = this.viewProvider!;
    return this.makeHandlers(
      {
        executeInBrowserView: (script) => base.executeInBrowserView(script, fileKey),
        getActiveTabView: () => base.getActiveTabView(fileKey),
        getActiveTabUrl: () => base.getActiveTabUrl(fileKey),
        openNewFileTab: base.openNewFileTab?.bind(base),
      },
      fileKey,
    );
  }

  /** Enable or disable write tools and notify connected clients. */
  public setWriteToolsEnabled(enabled: boolean): void {
    if (this._writeToolsEnabled === enabled) return;
    this._writeToolsEnabled = enabled;
    this.log.info(`MCP write tools ${enabled ? "enabled" : "disabled"}`);
    this.notifyToolsChanged();
  }

  /**
   * Enable or disable the Figma AI tools (the third tier: Figma's own agent,
   * image generation, credits). They spend the user's Figma AI credits, so
   * they have their own switch, separate from editing.
   */
  public setAiToolsEnabled(enabled: boolean): void {
    if (this._aiToolsEnabled === enabled) return;
    this._aiToolsEnabled = enabled;
    this.log.info(`MCP Figma AI tools ${enabled ? "enabled" : "disabled"}`);
    this.notifyToolsChanged();
  }

  /** The tools a client sees right now, by tier. */
  public listTools() {
    return [
      ...TOOLS,
      ...(this._writeToolsEnabled ? WRITE_TOOLS : []),
      ...(this._aiToolsEnabled ? AI_TOOLS : []),
    ];
  }

  /** Send tools/list_changed to every open SSE session. */
  private notifyToolsChanged(): void {
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
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      // Guards against a corrupted/empty settings value (e.g. NaN from a blank
      // port field) reaching http.Server.listen(), which would bind a random
      // port and store a bogus _boundPort.
      this.log.warn(`Invalid MCP port ${port} — falling back to ${MCP_PORT}`);
      port = MCP_PORT;
    }

    if (this._isRunning) {
      this.log.info("MCP server already running");
      return Promise.resolve({ didStart: true, port });
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          this.log.warn(`Port ${port} already in use — MCP server not started`);
        } else {
          this.log.error("Server error:", err);
        }
        // Drop the dead server so a later start() doesn't orphan this instance
        // (with its listeners) when it reassigns this.server.
        this.server?.removeAllListeners();
        this.server = null;
        // A runtime error can fire AFTER a successful listen — clear the running
        // flag too, or a later start() early-returns onto a dead server.
        this._isRunning = false;
        resolve({ didStart: false, port });
      });

      this.server.listen(port, host, () => {
        this._isRunning = true;
        this._boundPort = port;
        this.log.info(`MCP server running at http://${host}:${port}/mcp`);
        this.sessions.startReaper();
        resolve({ didStart: true, port });
      });
    });
  }

  /** Stop the HTTP server and clean up all sessions. */
  public stop(): void {
    void this.closeServer();
  }

  /**
   * Restart the listener on a (possibly new) port — used when the user changes
   * the server port in settings. No app restart needed; this is our own
   * http.Server. Waits for the old listener to fully close first.
   */
  public async restart(
    port = MCP_PORT,
    host = MCP_HOST,
  ): Promise<{ didStart: boolean; port: number }> {
    await this.closeServer();
    this.log.info(`MCP server restarting on port ${port}`);
    return this.start(port, host);
  }

  /** Close the listener and resolve once it has fully released the port. */
  private closeServer(): Promise<void> {
    this.sessions.shutdown();

    if (!this.server) return Promise.resolve();

    const srv = this.server;
    this.server = null;
    this._isRunning = false;

    return new Promise((resolve) => {
      // SSE responses are long-lived; force-close lingering sockets so close()
      // can complete instead of hanging on keep-alive connections.
      srv.closeAllConnections?.();
      srv.close(() => {
        this.log.info("MCP server stopped");
        resolve();
      });
    });
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

    // Origin validation: the MCP spec requires it, and without it any web page
    // could call these tools through the user's browser.
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      this.log.error("Access denied — Origin not allowed:", origin);
      res.writeHead(403);
      res.end("Access denied — Origin not allowed");
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
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

    // upload_assets — POST /upload/:token
    if (req.url?.startsWith("/upload/")) {
      await this.handleUpload(req, res);
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
      res.flushHeaders();
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
        return { jsonrpc: "2.0", id, result: { tools: this.listTools() } };
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

  private static readonly WRITE_TOOLS_DISABLED =
    "Write tools are disabled. Enable them in Settings → Integrations → Figma MCP → Allow editing tools.";
  private static readonly AI_TOOLS_DISABLED =
    "Figma AI tools are disabled. Enable them in Settings → Integrations → Figma MCP → Figma AI tools. They use your Figma AI credits.";

  /**
   * Tool dispatch table. Keyed by ToolName so tsc enforces a 1:1 mapping with
   * the advertised tool definitions — a missing or stray handler is a compile
   * error, not a runtime "Unknown tool". `write: true` marks tools gated behind
   * the write-tools setting; the gate is checked once in dispatchTool, so a new
   * write tool cannot accidentally ship without the guard.
   */
  private static readonly DISPATCH: Record<
    ToolName,
    { write?: true; ai?: true; run: (h: ToolHandlers, args: Record<string, unknown>) => unknown }
  > = {
    get_design_context: { run: (h, a) => h.toolGetDesignContext(a) },
    get_metadata: { run: (h, a) => h.toolGetMetadata(a) },
    get_file_info: { run: (h) => h.toolGetFileInfo() },
    get_screenshot: { run: (h, a) => h.toolGetScreenshot(a) },
    get_motion_context: { run: (h, a) => h.toolGetMotionContext(a) },
    get_variable_defs: { run: (h, a) => h.toolGetVariableDefs(a) },
    get_code_connect_map: { run: (h) => h.toolGetCodeConnectMap() },
    add_code_connect_map: { run: (h, a) => h.toolAddCodeConnectMap(a) },
    create_design_system_rules: { run: (h, a) => h.toolCreateDesignSystemRules(a) },
    get_figjam: { run: (h, a) => h.toolGetFigjam(a) },
    generate_diagram: { write: true, run: (h, a) => h.toolGenerateDiagram(a) },
    search_design_system: { run: (h, a) => h.toolSearchDesignSystem(a) },
    figma_find: { run: (h, a) => h.toolFigmaFind(a) },
    figma_tree: { run: (h, a) => h.toolFigmaTree(a) },
    use_figma: { write: true, run: (h, a) => h.toolUseFigma(a) },
    create_new_file: { write: true, run: (h, a) => h.toolCreateNewFile(a) },
    figma_text: { write: true, run: (h, a) => h.toolFigmaText(a) },
    whoami: { run: (h) => h.toolWhoami() },
    download_assets: { run: (h, a) => h.toolDownloadAssets(a) },
    upload_assets: { write: true, run: (h, a) => h.toolUploadAssets(a) },
    get_comments: { run: (h, a) => h.toolGetComments(a) },
    get_versions: { run: (h, a) => h.toolGetVersions(a) },
    list_libraries: { run: (h) => h.toolListLibraries() },
    get_library_styles: { run: (h, a) => h.toolGetLibraryStyles(a) },
    get_library_updates: { run: (h) => h.toolGetLibraryUpdates() },
    get_code_connect: { run: (h, a) => h.toolGetCodeConnect(a) },
    figma_agent_prompt: { ai: true, run: (h, a) => h.toolFigmaAgentPrompt(a) },
    figma_agent_threads: { ai: true, run: (h) => h.toolFigmaAgentThreads() },
    figma_agent_read: { ai: true, run: (h, a) => h.toolFigmaAgentRead(a) },
    figma_ai_credits: { ai: true, run: (h) => h.toolFigmaAiCredits() },
    figma_ai_generate_image: { ai: true, run: (h, a) => h.toolFigmaAiGenerateImage(a) },
    figma_ai_edit_image: { ai: true, run: (h, a) => h.toolFigmaAiEditImage(a) },
  };

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.viewProvider || !this.handlers) {
      return toolError("No Figma window open — open a file first");
    }

    const entry = McpServer.DISPATCH[name as ToolName];
    if (!entry) {
      return toolError(`Unknown tool: ${name}`);
    }
    if (entry.write && !this._writeToolsEnabled) {
      return toolError(McpServer.WRITE_TOOLS_DISABLED);
    }
    if (entry.ai && !this._aiToolsEnabled) {
      return toolError(McpServer.AI_TOOLS_DISABLED);
    }

    try {
      const fileKey = readFileKeyArg(args.fileKey);
      const handlers = fileKey ? this.handlersFor(fileKey) : this.handlers;
      if (entry.ai) {
        const notReady = await handlers.editorNotReady();
        if (notReady) return toolError(notReady);
      }
      return await entry.run(handlers, args);
    } catch (err: any) {
      this.log.error(`Tool error (${name}):`, err?.message ?? err);
      return toolError(err?.message ?? String(err));
    }
  }

  // ── Asset Upload ─────────────────────────────────────────────────────────

  /**
   * Receive the bytes for one upload_assets URL and place them in the file the
   * URL was issued for. Single use; expired or unknown tokens get 404, and the
   * write-tools switch is checked again here, not only when the URL was issued.
   */
  private async handleUpload(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", ...cors() });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") return reply(405, { error: "POST the asset bytes" });

    const now = Date.now();
    for (const [token, ticket] of this.uploads)
      if (ticket.expiresAt < now) this.uploads.delete(token);

    const token = req.url!.slice("/upload/".length);
    const ticket = this.uploads.get(token);
    if (!ticket)
      return reply(404, { error: "Unknown or expired upload URL; call upload_assets again" });
    this.uploads.delete(token);
    if (!this._writeToolsEnabled) return reply(403, { error: McpServer.WRITE_TOOLS_DISABLED });
    if (!this.viewProvider) return reply(503, { error: "No Figma window open" });

    let body: Buffer;
    try {
      body = await collectBytes(req, UPLOAD_MAX_BYTES);
    } catch (err: any) {
      return reply(413, { error: err?.message ?? String(err) });
    }

    try {
      const handlers = ticket.fileKey ? this.handlersFor(ticket.fileKey) : this.handlers!;
      const result = await handlers.placeUpload(ticket, req.headers["content-type"], body);
      reply(result?.error ? 422 : 200, result);
    } catch (err: any) {
      this.log.error("upload failed:", err?.message ?? err);
      reply(500, { error: err?.message ?? String(err) });
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
