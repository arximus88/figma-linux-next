/**
 * Skills written for Figma's remote MCP call remote names: create_session
 * first, sessionId on every tool, get_libraries / generate_image, and remote
 * parameter names (mermaidSyntax, componentName, source, codeConnectLabel).
 * Each one must reach the local tool it means (issue #92, sections 5-8).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import net from "node:net";

import { McpServer } from "Main/MCP";
import type { FigmaViewProvider } from "Main/MCP";
import { LIST_LIBRARIES_SCRIPT } from "Main/MCP/scripts/libraries";
import { mcpToolList } from "Main/MCP/tools/definitions";
import { resolveToolCall } from "Main/MCP/tools/remoteCompat";

describe("resolveToolCall", () => {
  it("drops the remote session arguments from every call", () => {
    const call = resolveToolCall("get_metadata", {
      nodeId: "1:2",
      sessionId: "00000000-0000-4000-8000-000000000000",
      skillNames: ["figma-use"],
      userIntent: "inspect",
    });
    expect(call).toEqual({ name: "get_metadata", args: { nodeId: "1:2" } });
  });

  it("runs an alias as its local tool with the same arguments", () => {
    expect(resolveToolCall("get_libraries", { fileKey: "K", offset: 0, sessionId: "s" })).toEqual({
      name: "list_libraries",
      args: { fileKey: "K", offset: 0 },
    });
    expect(resolveToolCall("generate_image", { prompt: "leaf", nodeId: "1:2" }).name).toBe(
      "figma_ai_generate_image",
    );
  });

  it("copies remote parameter names onto local ones, the local one winning", () => {
    expect(resolveToolCall("generate_diagram", { mermaidSyntax: "graph LR; A-->B" }).args).toEqual({
      mermaid: "graph LR; A-->B",
    });
    expect(
      resolveToolCall("generate_diagram", { mermaid: "own", mermaidSyntax: "remote" }).args,
    ).toEqual({ mermaid: "own" });
    expect(
      resolveToolCall("add_code_connect_map", {
        nodeId: "1:2",
        componentName: "Button",
        source: "src/Button.tsx",
        label: "React",
      }).args,
    ).toEqual({
      nodeId: "1:2",
      codeConnectName: "Button",
      codeConnectSrc: "src/Button.tsx",
      label: "React",
    });
    expect(resolveToolCall("get_code_connect_map", { codeConnectLabel: "Vue" }).args).toEqual({
      label: "Vue",
    });
  });
});

describe("tool list", () => {
  it("lists each alias in its target's tier, saying what it aliases", () => {
    const { read, ai } = mcpToolList();
    const lib = read.find((t) => t.name === "get_libraries");
    expect(lib?.description).toMatch(/^Alias of list_libraries/);
    expect(read.some((t) => t.name === "create_session")).toBe(true);
    const img = ai.find((t) => t.name === "generate_image");
    expect(img?.description).toMatch(/^Alias of figma_ai_generate_image/);
    expect(read.some((t) => t.name === "generate_image")).toBe(false);
  });
});

class MockProvider implements FigmaViewProvider {
  public calls: string[] = [];
  public respond: (script: string) => unknown = () => null;
  executeInBrowserView(script: string): Promise<any> {
    this.calls.push(script);
    return Promise.resolve(this.respond(script));
  }
  getActiveTabView(): null {
    return null;
  }
  getActiveTabUrl(): null {
    return null;
  }
}

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

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

describe("remote names over tools/call", () => {
  let server: McpServer;
  let provider: MockProvider;
  let base: string;
  let session: string;

  beforeEach(async () => {
    provider = new MockProvider();
    server = new McpServer(silentLogger);
    server.setViewProvider(provider);
    const port = await getFreePort();
    await server.start(port, "127.0.0.1");
    base = `http://127.0.0.1:${port}/mcp`;
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t" } },
      }),
    });
    session = res.headers.get("mcp-session-id") as string;
  });

  afterEach(() => server.stop());

  async function rpc(method: string, params?: unknown) {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Mcp-Session-Id": session },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method, params }),
    });
    return (await res.json()).result;
  }
  const call = (name: string, args: Record<string, unknown>) =>
    rpc("tools/call", { name, arguments: args });
  const text = (result: any) => result.content.map((c: any) => c.text ?? "").join("");

  it("create_session returns a UUID without touching the page", async () => {
    const out = JSON.parse(text(await call("create_session", { fileKey: "K", description: "x" })));
    expect(out.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
    expect(provider.calls).toHaveLength(0);
  });

  it("advertises sessionId on every tool but create_session", async () => {
    server.setWriteToolsEnabled(true);
    server.setAiToolsEnabled(true);
    const { tools } = await rpc("tools/list");
    for (const t of tools) {
      if (t.name === "create_session") continue;
      expect(t.inputSchema.properties.sessionId).toBeDefined();
    }
  });

  it("get_libraries runs list_libraries", async () => {
    provider.respond = () => ({ text: "Libraries: DS" });
    const out = await call("get_libraries", { fileKey: "AbC123xyz456", offset: 0, sessionId: "s" });
    expect(text(out)).toBe("Libraries: DS");
    expect(provider.calls).toEqual([LIST_LIBRARIES_SCRIPT]);
  });

  it("generate_image is refused like the AI tool it aliases while AI tools are off", async () => {
    const out = await call("generate_image", { prompt: "leaf" });
    expect(out.isError).toBe(true);
    expect(text(out)).toContain("Figma AI tools are disabled");
    expect(provider.calls).toHaveLength(0);
  });

  it("generate_image with nodeId asks the page to fill that node", async () => {
    server.setAiToolsEnabled(true);
    provider.respond = (script) =>
      script.includes("generateImages")
        ? { base64: btoa("png"), placed: { nodeId: "1:2" }, model: "m" }
        : true;
    await call("generate_image", { prompt: "leaf", nodeId: "1-2", sessionId: "s" });
    const script = provider.calls.find((s) => s.includes("generateImages")) as string;
    expect(script).toContain('"nodeId":"1:2"');
  });

  it("generate_diagram takes mermaidSyntax", async () => {
    server.setWriteToolsEnabled(true);
    provider.respond = () => ({ nodesCreated: 2, connectorsCreated: 1 });
    const out = await call("generate_diagram", {
      mermaidSyntax: "graph LR\n A-->B",
      name: "Flow",
      userIntent: "draw",
    });
    expect(text(out)).toContain("Created 2 nodes");
    expect(provider.calls).toHaveLength(1);
  });

  it("add/get_code_connect_map take the remote names and filter by node and label", async () => {
    await call("add_code_connect_map", {
      nodeId: "1-2",
      fileKey: "AbC123xyz456",
      componentName: "Button",
      source: "src/Button.tsx",
      label: "React",
    });
    await call("add_code_connect_map", {
      nodeId: "3:4",
      codeConnectName: "Card",
      codeConnectSrc: "src/Card.vue",
      label: "Vue",
    });
    const one = JSON.parse(
      text(await call("get_code_connect_map", { nodeId: "1-2", fileKey: "AbC123xyz456" })),
    );
    expect(one.count).toBe(1);
    expect(one.mappings["1:2"]).toEqual({
      codeConnectName: "Button",
      codeConnectSrc: "src/Button.tsx",
      label: "React",
    });
    const vue = JSON.parse(text(await call("get_code_connect_map", { codeConnectLabel: "vue" })));
    expect(Object.keys(vue.mappings)).toEqual(["3:4"]);
    const all = JSON.parse(text(await call("get_code_connect_map", {})));
    expect(all.count).toBe(2);
    expect(provider.calls).toHaveLength(0);
  });

  it("get_figjam with includeImagesOfNodes false takes no screenshots", async () => {
    provider.respond = () => ({ xml: "<figjam/>", nodeIds: ["1:2", "1:3"] });
    const out = await call("get_figjam", { includeImagesOfNodes: false });
    expect(text(out)).toBe("<figjam/>");
    expect(provider.calls).toHaveLength(1);
  });

  it("upload_assets accepts batchCommit and still hands out self-placing URLs", async () => {
    server.setWriteToolsEnabled(true);
    const out = JSON.parse(text(await call("upload_assets", { count: 2, batchCommit: true })));
    expect(out.uploads).toHaveLength(2);
    expect(out.batchCommit).toContain("not supported");
  });
});
