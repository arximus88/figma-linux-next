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
  public calls: { script: string; fileKey?: string }[] = [];
  executeInBrowserView(script: string, fileKey?: string): Promise<any> {
    this.calls.push({ script, fileKey });
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

  // ── New tools: figma_find / figma_tree / figma_text ──────────────────────

  it("lists the new read tools and gates figma_text behind write", async () => {
    const sessionId = await initialize();
    const off = await rpc({ jsonrpc: "2.0", id: 15, method: "tools/list" }, sessionId);
    const offNames = off.json.result.tools.map((t: { name: string }) => t.name);
    expect(offNames).toContain("figma_find");
    expect(offNames).toContain("figma_tree");
    expect(offNames).not.toContain("figma_text");

    server.setWriteToolsEnabled(true);
    const on = await rpc({ jsonrpc: "2.0", id: 16, method: "tools/list" }, sessionId);
    const onNames = on.json.result.tools.map((t: { name: string }) => t.name);
    expect(onNames).toContain("figma_text");
  });

  it("shapes figma_find results", async () => {
    const sessionId = await initialize();
    provider.nextResult = {
      matches: [{ id: "1:2", name: "Button", type: "FRAME", path: "Page" }],
      count: 1,
      truncated: false,
    };
    const res = await callTool(sessionId, "figma_find", { query: "Button" }, 17);
    expect(res.json.result.isError).toBeUndefined();
    expect(res.json.result.content[0].text).toContain("Button");
    expect(res.json.result.content[0].text).toContain("1:2");
  });

  it("returns figma_tree text and appends captured logs (A3)", async () => {
    const sessionId = await initialize();
    // execWithLogs unwraps {__logs, __result}; MockProvider returns it verbatim.
    provider.nextResult = {
      __logs: ["walked tree under Page"],
      __result: { tree: "PAGE Page #0:1" },
    };
    const res = await callTool(sessionId, "figma_tree", { maxDepth: 3 }, 18);
    expect(res.json.result.isError).toBeUndefined();
    const text = res.json.result.content[0].text;
    expect(text).toContain("PAGE Page #0:1");
    expect(text).toContain("--- logs ---");
    expect(text).toContain("walked tree under Page");
  });

  it("gates figma_text behind write tools", async () => {
    const sessionId = await initialize();
    const res = await callTool(sessionId, "figma_text", { nodeId: "1-2", characters: "Hi" }, 19);
    expect(res.json.result.isError).toBe(true);
    expect(res.json.result.content[0].text).toContain("disabled");
  });

  it("runs figma_text once write tools are enabled", async () => {
    server.setWriteToolsEnabled(true);
    const sessionId = await initialize();
    provider.nextResult = { success: true, nodeId: "1:2", name: "Label" };
    const res = await callTool(sessionId, "figma_text", { nodeId: "1-2", characters: "Hi" }, 20);
    expect(res.json.result.isError).toBeUndefined();
    expect(res.json.result.content[0].text).toContain("Label");
  });

  // ── A1: error hints ──────────────────────────────────────────────────────

  it("appends an actionable hint to a matching tool error (A1)", async () => {
    const sessionId = await initialize();
    provider.nextResult = { error: "Node not found: 9:9" };
    const res = await callTool(sessionId, "get_file_info", {}, 21);
    expect(res.json.result.isError).toBe(true);
    const text = res.json.result.content[0].text;
    expect(text).toContain("Node not found: 9:9");
    expect(text).toContain("Hint:");
    expect(text).toContain("figma_find");
  });

  it("leaves an unmatched error untouched (A1)", async () => {
    const sessionId = await initialize();
    provider.nextResult = { error: "some totally novel failure xyz" };
    const res = await callTool(sessionId, "get_file_info", {}, 22);
    expect(res.json.result.content[0].text).toBe("some totally novel failure xyz");
  });

  // ── getStatus / restart (configurable server port) ───────────────────────

  it("reports the bound port via getStatus", () => {
    const status = server.getStatus();
    expect(status.listening).toBe(true);
    expect(typeof status.port).toBe("number");
    expect(base).toContain(`:${status.port}/`);
  });

  describe("use_figma code and fileKey", () => {
    const call = (sessionId: string, name: string, args: Record<string, unknown>) =>
      rpc(
        { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } },
        sessionId,
      );
    const text = (res: any) => res.json.result.content[0].text as string;

    it("runs code in the page and returns what it returned", async () => {
      server.setWriteToolsEnabled(true);
      const sessionId = await initialize();
      provider.nextResult = { result: JSON.stringify({ createdNodeIds: ["1:5"] }), changes: 1 };

      const res = await call(sessionId, "use_figma", {
        code: "const i = (await figma.getNodeByIdAsync('1:2')).createInstance(); return { createdNodeIds: [i.id] };",
        description: "instance of Button",
      });
      expect(res.json.result.isError).toBeUndefined();
      expect(JSON.parse(text(res))).toEqual({ createdNodeIds: ["1:5"] });
      expect(provider.calls).toHaveLength(1);
      expect(provider.calls[0].script).toContain("createInstance()");
      expect(provider.calls[0].fileKey).toBeUndefined();
    });

    it("reports a rolled-back failure as an error that says the file is unchanged", async () => {
      server.setWriteToolsEnabled(true);
      const sessionId = await initialize();
      provider.nextResult = {
        error: "Cannot read 'x' of null",
        rolledBack: true,
        changesBeforeError: 3,
      };
      const res = await call(sessionId, "use_figma", { code: "return 1;" });
      expect(res.json.result.isError).toBe(true);
      expect(text(res)).toContain("Cannot read 'x' of null");
      expect(text(res)).toContain("were undone; the file is as it was");
    });

    it("refuses code that does not parse without touching the page", async () => {
      server.setWriteToolsEnabled(true);
      const sessionId = await initialize();
      const res = await call(sessionId, "use_figma", { code: "return (1;" });
      expect(res.json.result.isError).toBe(true);
      expect(text(res)).toContain("SyntaxError");
      expect(provider.calls).toHaveLength(0);
    });

    it("keeps code behind the write-tools switch", async () => {
      const sessionId = await initialize();
      const res = await call(sessionId, "use_figma", { code: "return 1;" });
      expect(res.json.result.isError).toBe(true);
      expect(provider.calls).toHaveLength(0);
    });

    it("routes a read tool to the tab of the named file, from a key or a URL", async () => {
      const sessionId = await initialize();
      provider.nextResult = { fileName: "Other file" };
      await call(sessionId, "get_file_info", { fileKey: "AbC123xyz456" });
      await call(sessionId, "get_file_info", {
        fileKey: "https://www.figma.com/design/AbC123xyz456/Other?node-id=1-2",
      });
      expect(provider.calls.map((c) => c.fileKey)).toEqual(["AbC123xyz456", "AbC123xyz456"]);
    });

    it("refuses a malformed fileKey instead of using the active tab", async () => {
      const sessionId = await initialize();
      const res = await call(sessionId, "get_file_info", { fileKey: "../../x" });
      expect(res.json.result.isError).toBe(true);
      expect(provider.calls).toHaveLength(0);
    });

    it("surfaces 'file not open' from the provider as a tool error", async () => {
      const sessionId = await initialize();
      provider.executeInBrowserView = (_s: string, fileKey?: string) => {
        throw new Error(`File ${fileKey} is not open in figma-linux-next.`);
      };
      const res = await call(sessionId, "get_file_info", { fileKey: "AbC123xyz456" });
      expect(res.json.result.isError).toBe(true);
      expect(text(res)).toContain("AbC123xyz456 is not open");
    });

    it("advertises fileKey on file tools and code on use_figma", async () => {
      server.setWriteToolsEnabled(true);
      const sessionId = await initialize();
      const res = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/list" }, sessionId);
      const byName = new Map<string, any>(res.json.result.tools.map((t: any) => [t.name, t]));
      for (const name of ["get_metadata", "get_screenshot", "use_figma", "figma_text"]) {
        expect(byName.get(name).inputSchema.properties.fileKey).toBeDefined();
      }
      expect(byName.get("get_code_connect_map").inputSchema.properties.fileKey).toBeUndefined();
      expect(byName.get("use_figma").inputSchema.properties.code.type).toBe("string");
    });
  });

  describe("Origin guard", () => {
    const initBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "page", version: "1" },
      },
    };

    it("refuses a web page's request: no session, no tool run", async () => {
      let executed = false;
      provider.executeInBrowserView = async () => {
        executed = true;
        return { fileName: "Secret design" };
      };
      const sessionId = await initialize();
      server.setWriteToolsEnabled(true);

      for (const origin of ["https://evil.example", "null", "http://localhost.evil.example"]) {
        const init = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify(initBody),
        });
        expect(init.status).toBe(403);
        expect(init.headers.get("mcp-session-id")).toBeNull();

        // Even with a session id leaked or guessed, the call is refused.
        const call = await fetch(base, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "Mcp-Session-Id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "get_file_info", arguments: {} },
          }),
        });
        expect(call.status).toBe(403);
      }
      expect(executed).toBe(false);
    });

    it("refuses the CORS preflight from a web page", async () => {
      const res = await fetch(base, {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("refuses the legacy SSE endpoint and assets from a web page", async () => {
      const port = new URL(base).port;
      for (const path of ["/sse", "/assets/x.png"]) {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: { Origin: "https://evil.example" },
        });
        expect(res.status).toBe(403);
      }
    });

    it("serves a local browser tool and echoes its origin, never a wildcard", async () => {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:6274" },
        body: JSON.stringify(initBody),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:6274");
    });

    it("serves clients that send no Origin without CORS headers for anyone", async () => {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initBody),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  it("opens a GET SSE stream on /mcp with session id", async () => {
    const sessionId = await initialize();
    const controller = new AbortController();
    const res = await fetch(base, {
      method: "GET",
      headers: { "Mcp-Session-Id": sessionId },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
  });

  it("restart() rebinds on a new port and serves there", async () => {
    const newPort = await getFreePort();
    const { didStart, port } = await server.restart(newPort, "127.0.0.1");
    expect(didStart).toBe(true);
    expect(port).toBe(newPort);
    expect(server.getStatus().port).toBe(newPort);

    // The new listener accepts an initialize on the new port.
    const res = await fetch(`http://127.0.0.1:${newPort}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "t", version: "1" },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
  });
});
