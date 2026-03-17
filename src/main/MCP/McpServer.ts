import http from "http";
import { net, ipcMain, IpcMainEvent } from "electron";

import { logger } from "Main/Logger";
import { getFileKeyFromUrl } from "Utils/Common";
import WindowManager from "Main/Ui/WindowManager";

const MCP_PORT = 3845;
const MCP_HOST = "127.0.0.1";
const FIGMA_MCP_URL = "https://mcp.figma.com/mcp";

const GET_CURRENT_FILE_TOOL = {
  name: "get_current_file",
  description:
    "Returns the fileKey, nodeId, URL, and title of the file currently open in figma-linux-next. " +
    "Use this to get the context for what the user is actively working on before calling other Figma tools.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [] as string[],
  },
};

interface McpContext {
  updateType: string;
  selectedNodes?: string[];
  pageId?: string;
  [key: string]: unknown;
}

export class McpServer {
  private server: http.Server | null = null;
  private lastContext: McpContext | null = null;

  constructor(private windowManager: WindowManager) {}

  private onContextUpdate(_event: IpcMainEvent, args: McpContext) {
    this.lastContext = args;
    if (import.meta.env.DEV) logger.debug("[MCP] context update:", JSON.stringify(args));
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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // OPTIONS preflight for CORS
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
      res.writeHead(400, { "Content-Type": "application/json", ...this.corsHeaders() });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        }),
      );
      return;
    }

    // Notifications: no response body required
    if (message.method?.startsWith("notifications/")) {
      res.writeHead(202, this.corsHeaders());
      res.end();
      return;
    }

    // initialize — respond locally with server capabilities
    if (message.method === "initialize") {
      res.writeHead(200, { "Content-Type": "application/json", ...this.corsHeaders() });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "figma-linux-next", version: "0.13.0" },
          },
        }),
      );
      return;
    }

    // tools/list — inject get_current_file into upstream tool list
    if (message.method === "tools/list") {
      const upstream = await this.proxyToFigma(message);
      const tools: any[] = upstream?.result?.tools ?? [];
      tools.unshift(GET_CURRENT_FILE_TOOL);
      if (upstream?.result) upstream.result.tools = tools;

      res.writeHead(200, { "Content-Type": "application/json", ...this.corsHeaders() });
      res.end(
        JSON.stringify(
          upstream ?? {
            jsonrpc: "2.0",
            id: message.id,
            result: { tools: [GET_CURRENT_FILE_TOOL] },
          },
        ),
      );
      return;
    }

    // tools/call — handle get_current_file locally, proxy everything else
    if (message.method === "tools/call") {
      if (message.params?.name === "get_current_file") {
        const result = this.handleGetCurrentFile();
        res.writeHead(200, { "Content-Type": "application/json", ...this.corsHeaders() });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          }),
        );
        return;
      }
    }

    // Everything else: stream-proxy to mcp.figma.com
    await this.proxyStream(req, body, res);
  }

  private handleGetCurrentFile() {
    const window = this.windowManager.getLastFocusedWindow();
    if (!window) return { error: "No Figma window open" };

    const tabId = window.getLatestFocusedTabId();
    if (!tabId) return { error: "No tab focused" };

    const { url, title } = window.getTabInfo(tabId);
    const fileKey = getFileKeyFromUrl(url);
    const nodeId = this.extractNodeId(url);

    const selectedNodes = this.lastContext?.selectedNodes ?? null;

    return { url, fileKey, nodeId, title, selectedNodes };
  }

  private extractNodeId(url: string): string | null {
    try {
      const nodeId = new URL(url).searchParams.get("node-id");
      return nodeId ? nodeId.replace(/-/g, ":") : null;
    } catch {
      return null;
    }
  }

  private async proxyToFigma(message: any): Promise<any | null> {
    try {
      const response = await net.fetch(FIGMA_MCP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      return (await response.json()) as any;
    } catch (err) {
      logger.error("[MCP] Upstream error:", err);
      return null;
    }
  }

  private async proxyStream(
    req: http.IncomingMessage,
    body: string,
    res: http.ServerResponse,
  ): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization as string;
    }

    try {
      const upstream = await net.fetch(FIGMA_MCP_URL, { method: "POST", headers, body });

      const contentType = upstream.headers.get("content-type") ?? "application/json";
      res.writeHead(upstream.status, { "Content-Type": contentType, ...this.corsHeaders() });

      if (upstream.body) {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      logger.error("[MCP] Proxy error:", err);
      res.writeHead(502, { "Content-Type": "application/json", ...this.corsHeaders() });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Upstream unavailable" },
          id: null,
        }),
      );
    }
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
