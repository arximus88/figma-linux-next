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
import fs from "node:fs";
import path from "node:path";
import {
  defaultLogger,
  MCP_HOST,
  MCP_PORT,
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
} from "./config";
import type {
  AssetEntry,
  CodeConnectEntry,
  FigmaViewProvider,
  JsonRpcRequest,
  JsonRpcResponse,
  Logger,
  McpSession,
} from "./types";
import {
  CREATE_PAGE_SCRIPT,
  DESIGN_CONTEXT_SCRIPT,
  DESIGN_SYSTEM_RULES_SCRIPT,
  FIGJAM_SCRIPT,
  FILE_INFO_SCRIPT,
  GENERATE_DIAGRAM_SCRIPT,
  METADATA_XML_SCRIPT,
  SCREENSHOT_SCRIPT,
  SEARCH_DESIGN_SYSTEM_SCRIPT,
  USE_FIGMA_SCRIPT,
  VARIABLE_DEFS_SCRIPT,
} from "./scripts";
import { TOOLS, WRITE_TOOLS } from "./tools/definitions";

// ── McpServer Class ────────────────────────────────────────────────────────────

export class McpServer {
  private server: http.Server | null = null;
  private sessions = new Map<string, McpSession>();
  private codeConnectMap = new Map<string, CodeConnectEntry>();
  private assetStore = new Map<string, AssetEntry>();
  private log: Logger;
  private viewProvider: FigmaViewProvider | null = null;
  private _isRunning = false;
  private _sessionReaper: ReturnType<typeof setInterval> | null = null;
  private _writeToolsEnabled = false;

  constructor(log?: Logger) {
    this.log = log ?? defaultLogger;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  /** Set the provider that gives us access to the Figma webContents. */
  public setViewProvider(provider: FigmaViewProvider): void {
    this.viewProvider = provider;
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
    for (const [, session] of this.sessions) {
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
        // Reap sessions idle for more than 30 minutes
        this._sessionReaper = setInterval(
          () => {
            const cutoff = Date.now() - 30 * 60 * 1000;
            for (const [id, session] of this.sessions) {
              if (session.lastActivity < cutoff) {
                if (session.sseResponse) {
                  try {
                    session.sseResponse.end();
                  } catch {
                    /* ignore */
                  }
                }
                this.sessions.delete(id);
                this.log.info("Session reaped (idle 30m):", id);
              }
            }
          },
          5 * 60 * 1000,
        );
        resolve({ didStart: true, port });
      });
    });
  }

  /** Stop the HTTP server and clean up all sessions. */
  public stop(): void {
    // Close all SSE connections
    for (const [id, session] of this.sessions) {
      if (session.sseResponse) {
        try {
          session.sseResponse.end();
        } catch {
          /* ignore */
        }
      }
      this.sessions.delete(id);
    }

    if (this._sessionReaper) {
      clearInterval(this._sessionReaper);
      this._sessionReaper = null;
    }

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
    if (!host || !this.isValidHost(host)) {
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
      res.writeHead(204, this.cors());
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

    res.writeHead(404, { "Content-Type": "application/json", ...this.cors() });
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
        this.replyError(res, 400, -32001, "No valid session", null);
        return;
      }
      const session = this.sessions.get(sessionId)!;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...this.cors(),
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
      res.writeHead(200, this.cors());
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, this.cors());
      res.end();
      return;
    }

    // Parse request body
    let body: JsonRpcRequest;
    try {
      const raw = await this.collectBody(req);
      body = JSON.parse(raw);
    } catch {
      this.replyError(res, 400, -32700, "Parse error", null);
      return;
    }

    // Notifications need no response
    if (body.method?.startsWith("notifications/")) {
      res.writeHead(202, this.cors());
      res.end();
      return;
    }

    // No session → must be initialize
    if (!sessionId) {
      if (body.method !== "initialize") {
        this.replyError(res, 400, -32000, "Must initialize first", body.id ?? null);
        return;
      }
      const newSessionId = crypto.randomUUID();
      const now = Date.now();
      this.sessions.set(newSessionId, {
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
        ...this.cors(),
      });
      res.end(JSON.stringify(result));
      return;
    }

    // With session → route the request
    if (!this.sessions.has(sessionId)) {
      this.replyError(res, 404, -32002, "Session not found", body.id ?? null);
      return;
    }

    // Touch last-activity so the TTL reaper doesn't evict active sessions
    this.sessions.get(sessionId)!.lastActivity = Date.now();

    const response = await this.handleJsonRpc(body);
    res.writeHead(200, { "Content-Type": "application/json", ...this.cors() });
    res.end(JSON.stringify(response));
  }

  // ── Legacy SSE Transport (/sse + /messages) ──────────────────────────────

  private handleSseConnect(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      sseResponse: res,
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...this.cors(),
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
      res.writeHead(400, { "Content-Type": "application/json", ...this.cors() });
      res.end(JSON.stringify({ error: "Invalid sessionId" }));
      return;
    }

    let body: JsonRpcRequest;
    try {
      const raw = await this.collectBody(req);
      body = JSON.parse(raw);
    } catch {
      this.replyError(res, 400, -32700, "Parse error", null);
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
    res.writeHead(202, this.cors());
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
    if (!this.viewProvider) {
      return this.toolError("No Figma window open — open a file first");
    }

    try {
      switch (name) {
        case "get_design_context":
          return await this.toolGetDesignContext(args);
        case "get_metadata":
          return await this.toolGetMetadata(args);
        case "get_file_info":
          return await this.toolGetFileInfo();
        case "get_screenshot":
          return await this.toolGetScreenshot(args);
        case "get_variable_defs":
          return await this.toolGetVariableDefs(args);
        case "get_code_connect_map":
          return this.toolGetCodeConnectMap();
        case "add_code_connect_map":
          return this.toolAddCodeConnectMap(args);
        case "create_design_system_rules":
          return await this.toolCreateDesignSystemRules(args);
        case "get_figjam":
          return await this.toolGetFigjam(args);
        case "generate_diagram":
          return await this.toolGenerateDiagram(args);
        case "search_design_system":
          return await this.toolSearchDesignSystem(args);
        case "use_figma":
          if (!this._writeToolsEnabled)
            return this.toolError(
              "Write tools are disabled. Enable them in Settings → General → MCP Server.",
            );
          return await this.toolUseFigma(args);
        case "create_new_file":
          if (!this._writeToolsEnabled)
            return this.toolError(
              "Write tools are disabled. Enable them in Settings → General → MCP Server.",
            );
          return await this.toolCreateNewFile(args);
        default:
          return this.toolError(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      this.log.error(`Tool error (${name}):`, err?.message ?? err);
      return this.toolError(err?.message ?? String(err));
    }
  }

  private toolResult(text: string) {
    return { content: [{ type: "text", text }] };
  }

  private toolError(text: string) {
    return { isError: true, content: [{ type: "text", text }] };
  }

  // ── Tool: get_design_context ─────────────────────────────────────────────

  private async toolGetDesignContext(args: Record<string, unknown>) {
    const nodeId = args.nodeId ? String(args.nodeId).replace(/-/g, ":") : null;
    const depth = typeof args.depth === "number" ? args.depth : 10;

    const script = DESIGN_CONTEXT_SCRIPT(nodeId, depth);
    const raw = await this.viewProvider!.executeInBrowserView(script);

    // Script returns a JSON string to avoid V8 structured-clone failures over IPC
    let result: any;
    try {
      result = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return this.toolError(
        "Failed to deserialize design context — the Figma scene graph may contain non-serializable objects",
      );
    }

    if (result?.error) {
      return this.toolError(result.error);
    }

    const json = JSON.stringify(result, null, 2);
    const approxTokens = Math.round(json.length / 4);
    const WARNING_TOKENS = 8_000;

    if (approxTokens > WARNING_TOKENS) {
      const warn =
        `⚠ Large response (~${(approxTokens / 1000).toFixed(1)}k tokens). ` +
        `This may fill context quickly. Consider re-calling with a more specific nodeId or a smaller depth.\n\n`;
      return this.toolResult(warn + json);
    }

    return this.toolResult(json);
  }

  // ── Tool: get_metadata ───────────────────────────────────────────────────

  private async toolGetMetadata(args: Record<string, unknown>) {
    const nodeId = args.nodeId ? String(args.nodeId).replace(/-/g, ":") : null;
    const depth = typeof args.depth === "number" ? args.depth : 8;

    const script = METADATA_XML_SCRIPT(nodeId, depth);
    const raw = await this.viewProvider!.executeInBrowserView(script);

    let result: any;
    try {
      result = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return this.toolError("Failed to deserialize metadata response");
    }

    if (result?.error) {
      return this.toolError(result.error);
    }

    return this.toolResult(result.xml ?? "");
  }

  // ── Tool: get_file_info ──────────────────────────────────────────────────

  private async toolGetFileInfo() {
    const result = await this.viewProvider!.executeInBrowserView(FILE_INFO_SCRIPT);

    if (result?.error) {
      return this.toolError(result.error);
    }

    return this.toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: get_screenshot ─────────────────────────────────────────────────

  private async toolGetScreenshot(args: Record<string, unknown>) {
    const nodeId = args.nodeId ? String(args.nodeId).replace(/-/g, ":") : null;
    const scale = typeof args.scale === "number" ? Math.min(4, Math.max(0.5, args.scale)) : 2;
    const savePath = args.savePath ? String(args.savePath) : null;

    // Try Plugin API exportAsync first
    const script = SCREENSHOT_SCRIPT(nodeId, scale);
    const result = await this.viewProvider!.executeInBrowserView(script);

    if (result?.error) {
      // Fallback: capture the visible page via capturePage
      this.log.warn("Plugin API export failed, falling back to capturePage:", result.error);
      return this.capturePageFallback(savePath);
    }

    if (result?.base64) {
      return this.buildScreenshotResponse(result.base64, result.nodeId, result.nodeName, savePath);
    }

    return this.toolError("Screenshot export returned no data");
  }

  /** Build an MCP response with the image inline + optional disk save. */
  private buildScreenshotResponse(
    base64: string,
    nodeId: string,
    nodeName: string,
    savePath: string | null,
  ) {
    type ContentItem = { type: string; data?: string; mimeType?: string; text?: string };
    const content: ContentItem[] = [{ type: "image", data: base64, mimeType: "image/png" }];

    const meta: Record<string, unknown> = { nodeId, nodeName };

    if (savePath) {
      try {
        const absPath = path.isAbsolute(savePath) ? savePath : path.join(process.cwd(), savePath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, Buffer.from(base64, "base64"));
        meta.savedTo = absPath;
      } catch (e: any) {
        meta.saveError = e.message;
      }
    }

    content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
    return { content };
  }

  /** Fallback: use Electron's capturePage on the webContents */
  private async capturePageFallback(savePath: string | null = null) {
    const view = this.viewProvider!.getActiveTabView();
    if (!view) return this.toolError("No active Figma view");

    const image = await view.webContents.capturePage();
    const buffer = image.toPNG();
    return this.buildScreenshotResponse(
      buffer.toString("base64"),
      "",
      "canvas (capturePage fallback)",
      savePath,
    );
  }

  // ── Tool: get_variable_defs ──────────────────────────────────────────────

  private async toolGetVariableDefs(args: Record<string, unknown>) {
    const nodeId = args.nodeId ? String(args.nodeId).replace(/-/g, ":") : null;
    const script = VARIABLE_DEFS_SCRIPT(nodeId);
    const result = await this.viewProvider!.executeInBrowserView(script);

    if (result?.error) {
      return this.toolError(result.error);
    }

    return this.toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: get_code_connect_map ───────────────────────────────────────────

  private toolGetCodeConnectMap() {
    const map: Record<string, { codeConnectSrc: string; codeConnectName: string }> = {};
    for (const [nodeId, entry] of this.codeConnectMap) {
      map[nodeId] = {
        codeConnectSrc: entry.codeConnectSrc,
        codeConnectName: entry.codeConnectName,
      };
    }

    return this.toolResult(
      JSON.stringify(
        {
          mappings: map,
          count: this.codeConnectMap.size,
        },
        null,
        2,
      ),
    );
  }

  // ── Tool: get_figjam ─────────────────────────────────────────────────────

  private async toolGetFigjam(args: Record<string, unknown>) {
    const nodeId = args.nodeId ? String(args.nodeId).replace(/-/g, ":") : null;
    const script = FIGJAM_SCRIPT(nodeId);
    const result = await this.viewProvider!.executeInBrowserView(script);

    if (result?.error) {
      return this.toolError(result.error);
    }

    // Try to capture screenshots of top nodes
    const screenshots: Record<string, string> = {};
    if (result.nodeIds?.length > 0) {
      for (const nid of result.nodeIds.slice(0, 5)) {
        try {
          const ssScript = SCREENSHOT_SCRIPT(nid, 1);
          const ssResult = await this.viewProvider!.executeInBrowserView(ssScript);
          if (ssResult?.base64) {
            const buffer = Buffer.from(ssResult.base64, "base64");
            const assetId = `${crypto.randomUUID()}.png`;
            this.assetStore.set(assetId, { data: buffer, contentType: "image/png" });
            setTimeout(() => this.assetStore.delete(assetId), 10 * 60 * 1000);
            screenshots[nid] = `http://${MCP_HOST}:${MCP_PORT}/assets/${assetId}`;
          }
        } catch {
          /* skip */
        }
      }
    }

    let xml = result.xml ?? "";
    if (Object.keys(screenshots).length > 0) {
      xml += "\n<!-- Node Screenshots -->\n";
      for (const [nid, url] of Object.entries(screenshots)) {
        xml += `<!-- node="${nid}" screenshot="${url}" -->\n`;
      }
    }

    return this.toolResult(xml);
  }

  // ── Tool: generate_diagram ───────────────────────────────────────────────

  private async toolGenerateDiagram(args: Record<string, unknown>) {
    const mermaid = args.mermaid as string;
    if (!mermaid) {
      return this.toolError("Missing required field: mermaid (Mermaid diagram syntax)");
    }

    const { nodes, edges } = this.parseMermaid(mermaid);
    if (nodes.length === 0) {
      return this.toolError("Could not parse any nodes from the Mermaid syntax.");
    }

    const nodesWithEdges = nodes.map((n) => ({
      ...n,
      _edges: edges.filter((e) => e.from === n.id),
    }));
    const nodesJson = JSON.stringify(nodesWithEdges);
    const script = GENERATE_DIAGRAM_SCRIPT(nodesJson);
    const result = await this.viewProvider!.executeInBrowserView(script);

    if (result?.error) {
      return this.toolError(result.error);
    }

    return this.toolResult(
      JSON.stringify(
        {
          success: true,
          nodesCreated: result.nodesCreated,
          connectorsCreated: result.connectorsCreated,
          message: `Created ${result.nodesCreated} nodes and ${result.connectorsCreated} connectors in FigJam.`,
        },
        null,
        2,
      ),
    );
  }

  /** Parse Mermaid syntax into nodes and edges. */
  private parseMermaid(src: string): {
    nodes: { id: string; label: string; shape: string }[];
    edges: { from: string; to: string; label: string }[];
  } {
    const nodes = new Map<string, { id: string; label: string; shape: string }>();
    const edges: { from: string; to: string; label: string }[] = [];
    // Pre-process: split on newlines + semicolons, strip directives, expand chains (A-->B-->C → A-->B, B-->C)
    const NODE_PAT = "[\\w]+(?:\\[[^\\]]+\\]|\\([^)]+\\)|\\{[^}]+\\})?";
    const ARROW_PAT = "(?:-->|==>|-\\.->|---)";
    const EL_PAT = "(?:\\|[^|]*\\|)?";
    const firstNodeRe = new RegExp(`^(${NODE_PAT})`);
    const contRe = new RegExp(`^\\s*(${ARROW_PAT})\\s*(${EL_PAT})\\s*(${NODE_PAT})`);
    const directiveRe =
      /^(?:graph|flowchart|stateDiagram|sequenceDiagram|gantt|title|section|dateFormat|axisFormat)\s*(?:TD|LR|TB|RL|BT)?\s*;?\s*(.*)/i;

    const lines: string[] = [];
    for (const raw of src
      .split(/[\n;]/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("%%"))) {
      const dm = raw.match(directiveRe);
      const stmt = dm ? dm[1].trim() : raw;
      if (!stmt) continue;

      // Expand chains: A-->B-->C → ["A-->B", "B-->C"]
      const firstNode = stmt.match(firstNodeRe);
      if (firstNode) {
        let prevNode = firstNode[1];
        let rest = stmt.slice(firstNode[0].length);
        const segs: string[] = [];
        while (rest.length > 0) {
          const cont = rest.match(contRe);
          if (!cont) break;
          segs.push(`${prevNode}${cont[1]}${cont[2]}${cont[3]}`);
          prevNode = cont[3];
          rest = rest.slice(cont[0].length);
        }
        lines.push(...(segs.length > 0 ? segs : [stmt]));
      } else {
        lines.push(stmt);
      }
    }

    for (const line of lines) {
      // Flowchart edges: A[Label] --> B[Label], A -->|label| B
      const em = line.match(
        /^\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?\s*(?:-->|==>|-.->|---)\s*(?:\|([^|]*)\|)?\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?/,
      );
      if (em) {
        const fId = em[1],
          fL = em[2] || em[3] || em[4] || em[1],
          eL = em[5] || "",
          tId = em[6],
          tL = em[7] || em[8] || em[9] || em[6];
        const fS = em[4] ? "DIAMOND" : em[3] ? "ELLIPSE" : "ROUNDED_RECTANGLE";
        const tS = em[9] ? "DIAMOND" : em[8] ? "ELLIPSE" : "ROUNDED_RECTANGLE";
        if (!nodes.has(fId)) nodes.set(fId, { id: fId, label: fL, shape: fS });
        if (!nodes.has(tId)) nodes.set(tId, { id: tId, label: tL, shape: tS });
        edges.push({ from: fId, to: tId, label: eL.trim() });
        continue;
      }

      // Standalone node: A["Label"]
      const nm = line.match(/^\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})\s*$/);
      if (nm) {
        const id = nm[1],
          label = nm[2] || nm[3] || nm[4] || id;
        const shape = nm[4] ? "DIAMOND" : nm[3] ? "ELLIPSE" : "ROUNDED_RECTANGLE";
        if (!nodes.has(id)) nodes.set(id, { id, label, shape });
        continue;
      }

      // Sequence diagram: Actor ->> Actor: message
      const sm = line.match(/^\s*([\w\s]+?)\s*(?:->>|-->>|->|-->)\s*([\w\s]+?)\s*:\s*(.+)$/);
      if (sm) {
        const fId = sm[1].trim().replace(/\s+/g, "_"),
          tId = sm[2].trim().replace(/\s+/g, "_");
        if (!nodes.has(fId))
          nodes.set(fId, { id: fId, label: sm[1].trim(), shape: "ROUNDED_RECTANGLE" });
        if (!nodes.has(tId))
          nodes.set(tId, { id: tId, label: sm[2].trim(), shape: "ROUNDED_RECTANGLE" });
        edges.push({ from: fId, to: tId, label: sm[3].trim() });
        continue;
      }

      // State diagram: StateA --> StateB : event
      const stm = line.match(/^\s*([\w]+)\s*-->\s*([\w]+)\s*(?::\s*(.+))?$/);
      if (stm) {
        if (!nodes.has(stm[1]))
          nodes.set(stm[1], { id: stm[1], label: stm[1], shape: "ROUNDED_RECTANGLE" });
        if (!nodes.has(stm[2]))
          nodes.set(stm[2], { id: stm[2], label: stm[2], shape: "ROUNDED_RECTANGLE" });
        edges.push({ from: stm[1], to: stm[2], label: (stm[3] || "").trim() });
      }
    }
    return { nodes: [...nodes.values()], edges };
  }

  // ── Tool: add_code_connect_map ───────────────────────────────────────────

  private toolAddCodeConnectMap(args: Record<string, unknown>) {
    const nodeId = args.nodeId ? String(args.nodeId).replace(/-/g, ":") : null;
    const codeConnectSrc = args.codeConnectSrc as string;
    const codeConnectName = args.codeConnectName as string;

    if (!nodeId || !codeConnectSrc || !codeConnectName) {
      return this.toolError("Missing required fields: nodeId, codeConnectSrc, codeConnectName");
    }

    this.codeConnectMap.set(nodeId, { nodeId, codeConnectSrc, codeConnectName });
    this.log.info(
      "Code Connect mapping added:",
      nodeId,
      "→",
      codeConnectName,
      `(${codeConnectSrc})`,
    );

    return this.toolResult(
      JSON.stringify(
        {
          success: true,
          nodeId,
          codeConnectSrc,
          codeConnectName,
          totalMappings: this.codeConnectMap.size,
        },
        null,
        2,
      ),
    );
  }

  // ── Tool: create_design_system_rules ─────────────────────────────────────

  private async toolCreateDesignSystemRules(args: Record<string, unknown>) {
    const techStack = (args.techStack as string) || "Not specified";
    const componentLibraryPath = (args.componentLibraryPath as string) || "Not specified";

    // Collect design system data from Figma
    const result = await this.viewProvider!.executeInBrowserView(DESIGN_SYSTEM_RULES_SCRIPT);

    if (result?.error) {
      return this.toolError(result.error);
    }

    // Format as a design system rules document
    const lines: string[] = [
      `# Design System Rules — ${result.fileName}`,
      "",
      `> Auto-generated from Figma file "${result.fileName}"`,
      "",
      "## Tech Stack",
      `- Framework: ${techStack}`,
      `- Component Library: ${componentLibraryPath}`,
      "",
    ];

    // Variables/tokens
    if (result.collections?.length > 0) {
      lines.push("## Design Tokens (Variables)", "");
      for (const coll of result.collections) {
        lines.push(`### ${coll.name}`, `Modes: ${coll.modes.join(", ")}`, "");
        lines.push("| Token | Type | Values |", "|-------|------|--------|");
        for (const v of coll.variables.slice(0, 50)) {
          const values = Object.entries(v.values || {})
            .map(([mode, val]: [string, any]) => `${mode}: ${JSON.stringify(val)}`)
            .join("; ");
          lines.push(`| \`${v.name}\` | ${v.type} | ${values} |`);
        }
        lines.push("");
      }
    }

    // Styles
    if (result.styles?.length > 0) {
      lines.push("## Styles", "");
      lines.push("| Name | Type | Description |", "|------|------|-------------|");
      for (const s of result.styles.slice(0, 50)) {
        lines.push(`| \`${s.name}\` | ${s.type} | ${s.description ?? "—"} |`);
      }
      lines.push("");
    }

    // Components
    if (result.components?.length > 0) {
      lines.push("## Components", "");
      for (const comp of result.components) {
        lines.push(`- **${comp.name}** (${comp.type})`);
        if (comp.properties && Object.keys(comp.properties).length > 0) {
          for (const [propName, propDef] of Object.entries(comp.properties) as [string, any][]) {
            lines.push(`  - \`${propName}\`: ${propDef?.type ?? "unknown"}`);
          }
        }
      }
      lines.push("");
    }

    // Code Connect mappings
    if (this.codeConnectMap.size > 0) {
      lines.push("## Code Connect Mappings", "");
      lines.push("| Figma Node ID | Component | File |", "|---------------|-----------|------|");
      for (const [_, entry] of this.codeConnectMap) {
        lines.push(
          `| ${entry.nodeId} | \`${entry.codeConnectName}\` | \`${entry.codeConnectSrc}\` |`,
        );
      }
      lines.push("");
    }

    lines.push(
      "## Usage Instructions",
      "",
      "Save this file to your project's `rules/` or `.cursor/rules/` directory.",
      "Your AI coding assistant will use these rules to generate code that matches",
      "your design system's tokens, styles, and component structure.",
      "",
    );

    return this.toolResult(lines.join("\n"));
  }

  // ── Tool: search_design_system ──────────────────────────────────────────

  private async toolSearchDesignSystem(args: Record<string, unknown>) {
    const query = (args.query as string) || "";
    if (!query) return this.toolError("query is required");

    const result = await this.viewProvider!.executeInBrowserView(
      SEARCH_DESIGN_SYSTEM_SCRIPT(query),
    );
    if (result?.error) return this.toolError(result.error);
    return this.toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: use_figma (write) ─────────────────────────────────────────────

  private async toolUseFigma(args: Record<string, unknown>) {
    const action = args.action as string;
    const params = args.params as Record<string, unknown>;
    if (!action) return this.toolError("action is required");
    if (!params) return this.toolError("params is required");

    const paramsJson = JSON.stringify(params);
    const result = await this.viewProvider!.executeInBrowserView(
      USE_FIGMA_SCRIPT(action, paramsJson),
    );
    if (result?.error) return this.toolError(result.error);
    return this.toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: create_new_file (create page, write) ──────────────────────────

  private async toolCreateNewFile(args: Record<string, unknown>) {
    const name = (args.name as string) || "Untitled Page";
    const result = await this.viewProvider!.executeInBrowserView(CREATE_PAGE_SCRIPT(name));
    if (result?.error) return this.toolError(result.error);
    return this.toolResult(JSON.stringify(result, null, 2));
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

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Validates that the HTTP Host header points to a loopback address.
   * Uses the WHATWG URL API for reliable hostname extraction.
   */
  private isValidHost(hostHeader: string): boolean {
    let hostname: string;
    try {
      // URL constructor reliably parses host:port combinations
      const parsed = new URL(`http://${hostHeader}`);
      hostname = parsed.hostname;
    } catch {
      return false;
    }

    // Allow only loopback addresses
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      "Content-Type": "application/json",
      ...this.cors(),
    });
    res.end(body);
  }

  /**
   * Sends a JSON-RPC 2.0 error response.
   * See: https://www.jsonrpc.org/specification#error_object
   */
  private replyError(
    res: http.ServerResponse,
    httpCode: number,
    rpcCode: number,
    msg: string,
    reqId: string | number | null = null,
  ): void {
    this.sendJson(res, httpCode, {
      jsonrpc: "2.0",
      error: { code: rpcCode, message: msg },
      id: reqId,
    });
  }

  /**
   * Collects the full request body as a UTF-8 string.
   * Uses for-await-of on the native readable stream.
   */
  private async collectBody(req: http.IncomingMessage): Promise<string> {
    const parts: string[] = [];
    req.setEncoding("utf8");
    for await (const chunk of req) {
      parts.push(chunk as string);
    }
    return parts.join("");
  }

  /**
   * Returns the minimum CORS headers required for MCP local transport.
   * See: https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
   */
  private cors(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    };
  }
}
