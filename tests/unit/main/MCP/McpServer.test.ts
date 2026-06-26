import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import net from "node:net";
import { McpServer } from "Main/MCP";
import type { FigmaViewProvider } from "Main/MCP";

/**
 * Integration smoke test for the MCP HTTP server.
 *
 * Drives the real http.Server over the Streamable HTTP transport (/mcp) to
 * lock in the externally observable contract — initialize → session id,
 * tools/list, tools/call (both the direct-object and JSON-string result
 * paths), ping, and error cases — before the transport/handler internals are
 * decomposed. The Figma view is faked via a mutable mock provider.
 */

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** A mock FigmaViewProvider whose next executeInBrowserView result is settable. */
class MockProvider implements FigmaViewProvider {
  public nextResult: unknown = null;
  executeInBrowserView(_script: string): Promise<any> {
    return Promise.resolve(this.nextResult);
  }
  getActiveTabView(): null {
    return null;
  }
  getActiveTabUrl(): null {
    return null;
  }
}

/** Bind an ephemeral port, then release it so McpServer can claim it. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe("McpServer (Streamable HTTP transport)", () => {
  let server: McpServer;
  let provider: MockProvider;
  let base: string;

  beforeEach(async () => {
    provider = new MockProvider();
    server = new McpServer(silentLogger);
    server.setViewProvider(provider);
    const port = await getFreePort();
    const { didStart } = await server.start(port, "127.0.0.1");
    expect(didStart).toBe(true);
    base = `http://127.0.0.1:${port}/mcp`;
  });

  afterEach(() => {
    server.stop();
  });

  /** POST a JSON-RPC message; returns { status, headers, json }. */
  async function rpc(body: unknown, sessionId?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const res = await fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  }

  async function initialize(): Promise<string> {
    const res = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.result.serverInfo.name).toBe("figma-linux-next");
    expect(res.json.result.protocolVersion).toBe("2025-03-26");
    const sessionId = res.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    return sessionId as string;
  }

  it("initializes and returns a session id", async () => {
    const sessionId = await initialize();
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it("rejects non-initialize requests without a session", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe(-32000);
  });

  it("lists the read tools", async () => {
    const sessionId = await initialize();
    const res = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, sessionId);
    expect(res.status).toBe(200);
    const names = res.json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_file_info");
    expect(names).toContain("get_design_context");
    // Write tools are gated off by default
    expect(names).not.toContain("use_figma");
  });

  it("exposes write tools once enabled", async () => {
    server.setWriteToolsEnabled(true);
    const sessionId = await initialize();
    const res = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/list" }, sessionId);
    const names = res.json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("use_figma");
  });

  it("calls a tool returning a direct object (get_file_info)", async () => {
    const sessionId = await initialize();
    provider.nextResult = { name: "Test File", type: "design" };
    const res = await rpc(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_file_info", arguments: {} },
      },
      sessionId,
    );
    expect(res.status).toBe(200);
    expect(res.json.result.content[0].text).toContain("Test File");
  });

  it("calls a tool returning a JSON string (get_design_context)", async () => {
    const sessionId = await initialize();
    provider.nextResult = JSON.stringify({ id: "1:2", name: "Frame", type: "FRAME" });
    const res = await rpc(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "get_design_context", arguments: { nodeId: "1-2" } },
      },
      sessionId,
    );
    expect(res.status).toBe(200);
    expect(res.json.result.content[0].text).toContain("Frame");
  });

  it("surfaces a tool's error payload as an MCP error result", async () => {
    const sessionId = await initialize();
    provider.nextResult = { error: "boom" };
    const res = await rpc(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "get_file_info", arguments: {} },
      },
      sessionId,
    );
    expect(res.json.result.isError).toBe(true);
    expect(res.json.result.content[0].text).toContain("boom");
  });

  it("answers ping", async () => {
    const sessionId = await initialize();
    const res = await rpc({ jsonrpc: "2.0", id: 8, method: "ping" }, sessionId);
    expect(res.status).toBe(200);
    expect(res.json.result).toEqual({});
  });

  it("returns method-not-found for unknown methods", async () => {
    const sessionId = await initialize();
    const res = await rpc({ jsonrpc: "2.0", id: 9, method: "does/not/exist" }, sessionId);
    expect(res.json.error.code).toBe(-32601);
  });

  /** Helper: invoke a tool over tools/call. */
  function callTool(sessionId: string, name: string, args: Record<string, unknown>, id: number) {
    return rpc(
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
      sessionId,
    );
  }

  it("threads code-connect state across add then get (no exec needed)", async () => {
    const sessionId = await initialize();
    const add = await callTool(
      sessionId,
      "add_code_connect_map",
      { nodeId: "10-20", codeConnectSrc: "src/Button.tsx", codeConnectName: "Button" },
      10,
    );
    expect(add.json.result.content[0].text).toContain("Button");

    const get = await callTool(sessionId, "get_code_connect_map", {}, 11);
    const payload = JSON.parse(get.json.result.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.mappings["10:20"].codeConnectName).toBe("Button");
  });

  it("generates a diagram from mermaid (parseMermaid + exec)", async () => {
    const sessionId = await initialize();
    provider.nextResult = { nodesCreated: 2, connectorsCreated: 1 };
    const res = await callTool(sessionId, "generate_diagram", { mermaid: "graph TD\n A-->B" }, 12);
    expect(res.json.result.content[0].text).toContain("Created 2 nodes");
  });

  it("rejects a write tool when write tools are disabled", async () => {
    const sessionId = await initialize();
    const res = await callTool(sessionId, "use_figma", { action: "noop", params: {} }, 13);
    expect(res.json.result.isError).toBe(true);
    expect(res.json.result.content[0].text).toContain("disabled");
  });

  it("runs a write tool once write tools are enabled", async () => {
    server.setWriteToolsEnabled(true);
    const sessionId = await initialize();
    provider.nextResult = { ok: true };
    const res = await callTool(sessionId, "use_figma", { action: "createFrame", params: {} }, 14);
    expect(res.json.result.isError).toBeUndefined();
    expect(res.json.result.content[0].text).toContain("ok");
  });
});
