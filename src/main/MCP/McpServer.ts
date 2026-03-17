import http from "http";
import { ipcMain, IpcMainEvent } from "electron";

import { logger } from "Main/Logger";
import { getFileKeyFromUrl } from "Utils/Common";
import WindowManager from "Main/Ui/WindowManager";

const MCP_PORT = 3845;
const MCP_HOST = "127.0.0.1";

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_current_file",
    description:
      "Returns the fileKey, nodeId, URL, and title of the file currently open in figma-linux-next. " +
      "Always call this first to get context before calling other Figma tools.",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
  },
  {
    name: "get_file_nodes",
    description:
      "Returns the design tree for one or more nodes from a Figma file. " +
      "Use this to inspect component structure, layout, and style properties.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string", description: "Figma file key" },
        nodeIds: {
          type: "array",
          items: { type: "string" },
          description: "Node IDs in '1:2' format",
        },
        depth: {
          type: "number",
          description: "Tree depth to traverse (default: 2, use 0 for full tree)",
        },
      },
      required: ["fileKey", "nodeIds"],
    },
  },
  {
    name: "get_image",
    description:
      "Exports a Figma node as an image (SVG or PNG). " +
      "Use this for visual reference when implementing a component.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string", description: "Figma file key" },
        nodeId: { type: "string", description: "Node ID in '1:2' format" },
        format: {
          type: "string",
          enum: ["svg", "png", "jpg"],
          description: "Image format (default: svg)",
        },
        scale: {
          type: "number",
          description: "Export scale 0.5–4 (default: 1, PNG only)",
        },
      },
      required: ["fileKey", "nodeId"],
    },
  },
  {
    name: "get_file_variables",
    description: "Returns design tokens (colors, spacing, typography) defined as variables in a Figma file.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string", description: "Figma file key" },
      },
      required: ["fileKey"],
    },
  },
  {
    name: "get_file_styles",
    description: "Returns named styles (color, text, effect, grid) published in a Figma file.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string", description: "Figma file key" },
      },
      required: ["fileKey"],
    },
  },
  {
    name: "whoami",
    description: "Returns the authenticated Figma user. Useful to verify the session is active.",
    inputSchema: { type: "object", properties: {}, required: [] as string[] },
  },
];

// ── Context from Figma web app ────────────────────────────────────────────────

interface McpContext {
  updateType: string;
  selectedNodes?: string[];
  pageId?: string;
  [key: string]: unknown;
}

// ── Server ────────────────────────────────────────────────────────────────────

export class McpServer {
  private server: http.Server | null = null;
  private lastContext: McpContext | null = null;

  constructor(private windowManager: WindowManager) {}

  private onContextUpdate(_event: IpcMainEvent, args: McpContext) {
    this.lastContext = args;
  }

  public start(): void {
    ipcMain.on("mcpContextUpdate", this.onContextUpdate.bind(this));
    this.server = http.createServer(this.handleRequest.bind(this));

    this.server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.warn(`[MCP] Port ${MCP_PORT} already in use — local MCP server not started`);
      } else {
        logger.error("[MCP] Server error:", err);
      }
    });

    this.server.listen(MCP_PORT, MCP_HOST, () => {
      logger.info(`[MCP] Local Figma MCP server running at http://${MCP_HOST}:${MCP_PORT}/mcp`);
    });
  }

  public stop(): void {
    ipcMain.removeAllListeners("mcpContextUpdate");
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info("[MCP] Local Figma MCP server stopped");
    }
  }

  // ── HTTP handler ────────────────────────────────────────────────────────────

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === "OPTIONS") {
      res.writeHead(204, this.corsHeaders());
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const body = await this.readBody(req);
    let message: any;

    try {
      message = JSON.parse(body);
    } catch {
      this.sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
      return;
    }

    if (message.method?.startsWith("notifications/")) {
      res.writeHead(202, this.corsHeaders());
      res.end();
      return;
    }

    if (message.method === "initialize") {
      this.sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "figma-linux-next", version: "0.13.0" },
        },
      });
      return;
    }

    if (message.method === "tools/list") {
      this.sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });
      return;
    }

    if (message.method === "tools/call") {
      const result = await this.dispatchTool(message.params?.name, message.params?.arguments ?? {});
      this.sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result });
      return;
    }

    this.sendJson(res, 200, {
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "Method not found" },
    });
  }

  // ── Tool dispatch ───────────────────────────────────────────────────────────

  private async dispatchTool(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        case "get_current_file":
          return this.toolResult(JSON.stringify(this.handleGetCurrentFile(), null, 2));
        case "get_file_nodes":
          return this.toolResult(JSON.stringify(await this.getFileNodes(args), null, 2));
        case "get_image":
          return this.toolResult(JSON.stringify(await this.getImage(args), null, 2));
        case "get_file_variables":
          return this.toolResult(JSON.stringify(await this.getFileVariables(args), null, 2));
        case "get_file_styles":
          return this.toolResult(JSON.stringify(await this.getFileStyles(args), null, 2));
        case "whoami":
          return this.toolResult(JSON.stringify(await this.whoami(), null, 2));
        default:
          return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
      }
    } catch (err: any) {
      logger.error(`[MCP] Tool error (${name}):`, err?.message ?? err);
      return { isError: true, content: [{ type: "text", text: err?.message ?? String(err) }] };
    }
  }

  private toolResult(text: string) {
    return { content: [{ type: "text", text }] };
  }

  // ── Tool implementations ────────────────────────────────────────────────────

  private handleGetCurrentFile() {
    const win = this.windowManager.getLastFocusedWindow();
    if (!win) return { error: "No Figma window open" };

    const tabId = win.getLatestFocusedTabId();
    if (!tabId) return { error: "No tab focused" };

    const { url, title } = win.getTabInfo(tabId);

    return {
      url,
      fileKey: getFileKeyFromUrl(url),
      nodeId: this.extractNodeId(url),
      title,
      selectedNodes: this.lastContext?.selectedNodes ?? null,
    };
  }

  private async getFileNodes(args: { fileKey: string; nodeIds: string[]; depth?: number }) {
    const ids = args.nodeIds.join(",");
    const depth = args.depth ?? 2;
    const params = `ids=${encodeURIComponent(ids)}&depth=${depth}`;
    return this.figmaGet(`/files/${args.fileKey}/nodes?${params}`);
  }

  private async getImage(args: { fileKey: string; nodeId: string; format?: string; scale?: number }) {
    const format = args.format ?? "svg";
    const scale = args.scale ?? 1;
    const id = encodeURIComponent(args.nodeId);
    const params = `ids=${id}&format=${format}&scale=${scale}`;
    return this.figmaGet(`/images/${args.fileKey}?${params}`);
  }

  private async getFileVariables(args: { fileKey: string }) {
    return this.figmaGet(`/files/${args.fileKey}/variables/local`);
  }

  private async getFileStyles(args: { fileKey: string }) {
    return this.figmaGet(`/files/${args.fileKey}/styles`);
  }

  private async whoami() {
    return this.figmaGet("/me");
  }

  // ── Figma REST API ──────────────────────────────────────────────────────────
  // Executes fetch from within the active Figma BrowserView — same origin,
  // session cookies included automatically, no personal access token needed.

  private async figmaGet(path: string): Promise<any> {
    const win = this.windowManager.getLastFocusedWindow();
    if (!win) throw new Error("No Figma window open");

    const data = await win.figmaApiFetch(path);

    if (data?.error) throw new Error(data.error);
    if (data?.status && data.status >= 400) throw new Error(`Figma API ${data.status}: ${data.err ?? JSON.stringify(data)}`);

    return data;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private extractNodeId(url: string): string | null {
    try {
      const nodeId = new URL(url).searchParams.get("node-id");
      return nodeId ? nodeId.replace(/-/g, ":") : null;
    } catch {
      return null;
    }
  }

  private sendJson(res: http.ServerResponse, status: number, data: any) {
    res.writeHead(status, { "Content-Type": "application/json", ...this.corsHeaders() });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  private corsHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "http://127.0.0.1",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }
}
