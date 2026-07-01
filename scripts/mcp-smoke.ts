/**
 * mcp-smoke.ts — live self-bootstrapping smoke test for the built-in Figma MCP.
 *
 * Exercises EVERY tool against a real open Figma file over the HTTP JSON-RPC
 * transport (no CDP needed). It builds a known scene with the write tools, reads
 * it back with every read tool, mutates it, then cleans up — so it does not
 * depend on any particular file's contents.
 *
 * Preconditions:
 *   1. The app is running with a *Design* file open (blank is fine).
 *   2. Settings → MCP integrations → "Enable write tools" is ON.
 *   3. The Figma MCP server is enabled (default) — reachable on the port below.
 *
 * Run:
 *   bun run scripts/mcp-smoke.ts            # port 3845
 *   bun run scripts/mcp-smoke.ts 4000       # custom server port
 *   MCP_PORT=4000 bun run scripts/mcp-smoke.ts
 *
 * FigJam tools (get_figjam, generate_diagram) need a FigJam file; they are
 * marked SKIP when a Design file is open.
 */

const PORT = Number(process.env.MCP_PORT ?? process.argv[2] ?? 3845);
const BASE = `http://127.0.0.1:${PORT}/mcp`;

let session = "";
let rpcId = 0;

type Status = "PASS" | "FAIL" | "SKIP";
const results: { tool: string; status: Status; note: string }[] = [];
function record(tool: string, status: Status, note = "") {
  results.push({ tool, status, note });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  console.log(`  ${icon} ${tool.padEnd(26)} ${status}${note ? ` — ${note}` : ""}`);
}

async function rpc(method: string, params?: unknown): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["Mcp-Session-Id"] = session;
  const res = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) session = sid;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type ToolResult = { isError: boolean; text: string; hasImage: boolean; err?: unknown };
async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const j = await rpc("tools/call", { name, arguments: args });
  if (j?.error) return { isError: true, text: "", hasImage: false, err: j.error };
  const content = j?.result?.content ?? [];
  const textItem = content.find((c: any) => c.type === "text");
  const image = content.find((c: any) => c.type === "image");
  return { isError: !!j?.result?.isError, text: textItem?.text ?? "", hasImage: !!image };
}

/** Strip the optional "⚠ Large response…" preamble and parse JSON, else null. */
function parseJson(text: string): any {
  const cleaned = text.replace(/^⚠[^\n]*\n\n/, "").split("\n\n--- logs ---")[0];
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n▶ Figma MCP smoke test — ${BASE}\n`);

  // ── Preflight ────────────────────────────────────────────────────────────
  let init: any = null;
  try {
    init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "mcp-smoke", version: "1" },
    });
  } catch {
    init = null;
  }
  if (!init?.result) {
    console.error(`✗ Cannot reach the MCP server on :${PORT}. Is the app running / server enabled?`);
    process.exit(2);
  }
  console.log(`  connected: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);

  const list = await rpc("tools/list");
  const toolNames: string[] = (list?.result?.tools ?? []).map((t: any) => t.name);
  if (!toolNames.includes("use_figma")) {
    console.error("\n✗ Write tools are not exposed. Enable Settings → MCP → 'Enable write tools' and retry.");
    process.exit(3);
  }

  const probe = await call("get_file_info");
  if (probe.isError && /not available|No Figma window|not open/i.test(probe.text)) {
    console.error(`\n✗ No Figma file reachable: ${probe.text}\n  Open a Design file in the app and retry.`);
    process.exit(4);
  }

  // Unique suffix so re-runs don't collide on the leftover variable collection.
  const runId = Date.now().toString(36);
  const varName = `mcp-smoke-${runId}`;

  // ── BUILD (write tools) ──────────────────────────────────────────────────
  console.log("\n■ build");
  const frame = parseJson(
    (
      await call("use_figma", {
        action: "create_frame",
        params: {
          name: "MCP Smoke Frame",
          width: 400,
          height: 300,
          layoutMode: "VERTICAL",
          itemSpacing: 8,
          paddingTop: 16,
          paddingLeft: 16,
          fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.12 } }],
        },
      })
    ).text,
  );
  const frameId: string | undefined = frame?.nodeId;
  record("use_figma:create_frame", frameId ? "PASS" : "FAIL", frameId ?? "no nodeId returned");
  if (!frameId) return finish();

  const text = parseJson(
    (
      await call("use_figma", {
        action: "create_text",
        params: {
          name: "MCP Smoke Label",
          characters: "Hello MCP",
          parentNodeId: frameId,
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
        },
      })
    ).text,
  );
  const textId: string | undefined = text?.nodeId;
  record("use_figma:create_text", textId ? "PASS" : "FAIL", textId ?? "no nodeId");

  const variable = parseJson(
    (
      await call("use_figma", {
        action: "set_variable",
        params: {
          name: varName,
          collectionName: `MCP Smoke ${runId}`,
          resolvedType: "COLOR",
          value: { r: 0.2, g: 0.6, b: 1, a: 1 },
        },
      })
    ).text,
  );
  record("use_figma:set_variable", variable?.success ? "PASS" : "FAIL", variable?.name ?? "");

  if (textId) {
    const ft = await call("figma_text", { nodeId: textId, characters: "Hello MCP (edited)" });
    record("figma_text", !ft.isError && parseJson(ft.text)?.success ? "PASS" : "FAIL", ft.text.slice(0, 60));
  }

  // ── READ (assert against the built scene) ────────────────────────────────
  console.log("\n■ read");
  const fi = await call("get_file_info");
  record("get_file_info", !fi.isError && /fileName|currentPage/.test(fi.text) ? "PASS" : "FAIL");

  const meta = await call("get_metadata", { nodeId: frameId, depth: 3 });
  record("get_metadata", /MCP Smoke Frame|MCP Smoke Label/.test(meta.text) ? "PASS" : "FAIL");

  const tree = await call("figma_tree", { nodeId: frameId, maxDepth: 4 });
  const treeOk = /MCP Smoke Frame/.test(tree.text) && /MCP Smoke Label/.test(tree.text);
  const logsOk = /--- logs ---/.test(tree.text);
  record("figma_tree", treeOk ? "PASS" : "FAIL", logsOk ? "logs channel OK" : "no logs section");

  const find = await call("figma_find", { query: "MCP Smoke" });
  const findJson = parseJson(find.text);
  const foundFrame = (findJson?.matches ?? []).some((m: any) => m.id === frameId);
  record("figma_find", foundFrame ? "PASS" : "FAIL", `${findJson?.count ?? 0} matches`);

  const dc = await call("get_design_context", { nodeId: frameId, depth: 5 });
  record("get_design_context", /Hello MCP \(edited\)/.test(dc.text) ? "PASS" : "FAIL");

  // Selection-sensitive: with a node selected it runs in selection mode, so assert
  // the tool returns a valid shape rather than requiring our file-wide variable.
  const vars = await call("get_variable_defs");
  const vj = parseJson(vars.text);
  record(
    "get_variable_defs",
    !vars.isError && Array.isArray(vj?.variables) ? "PASS" : "FAIL",
    vj?.source ? `${vj.source} mode` : "",
  );

  const search = await call("search_design_system", { query: varName });
  record("search_design_system", new RegExp(varName).test(search.text) ? "PASS" : "FAIL");

  const shot = await call("get_screenshot", { nodeId: frameId });
  record("get_screenshot", shot.hasImage ? "PASS" : "FAIL", shot.hasImage ? "" : shot.text.slice(0, 50));

  const dsr = await call("create_design_system_rules");
  record("create_design_system_rules", !dsr.isError && /Design System Rules/.test(dsr.text) ? "PASS" : "FAIL");

  // Code Connect map: session state, no Figma exec.
  const add = await call("add_code_connect_map", {
    nodeId: frameId,
    codeConnectSrc: "src/Smoke.tsx",
    codeConnectName: "Smoke",
  });
  record("add_code_connect_map", !add.isError && /Smoke/.test(add.text) ? "PASS" : "FAIL");
  const ccm = await call("get_code_connect_map");
  record("get_code_connect_map", new RegExp(frameId).test(ccm.text) ? "PASS" : "FAIL");

  // ── MUTATE ───────────────────────────────────────────────────────────────
  console.log("\n■ mutate");
  const upd = await call("use_figma", {
    action: "update_node",
    params: { nodeId: frameId, name: "MCP Smoke Frame (renamed)" },
  });
  record("use_figma:update_node", !upd.isError && parseJson(upd.text)?.success ? "PASS" : "FAIL");

  const frame2 = parseJson(
    (await call("use_figma", { action: "create_frame", params: { name: "MCP Smoke Frame 2", width: 200, height: 200 } })).text,
  );
  const frame2Id: string | undefined = frame2?.nodeId;
  if (textId && frame2Id) {
    const rp = await call("use_figma", {
      action: "reparent_node",
      params: { nodeId: textId, parentNodeId: frame2Id },
    });
    record("use_figma:reparent_node", !rp.isError && parseJson(rp.text)?.success ? "PASS" : "FAIL");
  } else {
    record("use_figma:reparent_node", "SKIP", "missing ids");
  }

  // ── FigJam (needs a FigJam file) ─────────────────────────────────────────
  console.log("\n■ figjam (needs a FigJam file)");
  const figjam = await call("get_figjam");
  record("get_figjam", figjam.isError ? "SKIP" : "PASS", figjam.isError ? "open a FigJam file" : "");
  const diagram = await call("generate_diagram", { mermaid: "graph TD; A[Start]-->B[End];" });
  record("generate_diagram", diagram.isError ? "SKIP" : "PASS", diagram.isError ? "requires FigJam" : "");

  // ── CLEAN ────────────────────────────────────────────────────────────────
  console.log("\n■ cleanup");
  for (const [label, id] of [
    ["frame", frameId],
    ["frame2", frame2Id],
  ] as const) {
    if (!id) continue;
    const del = await call("use_figma", { action: "delete_node", params: { nodeId: id } });
    record(`use_figma:delete_node(${label})`, !del.isError && parseJson(del.text)?.success ? "PASS" : "FAIL");
  }
  console.log("  note: the 'MCP Smoke' variable collection is left behind (no delete-variable tool).");

  finish();
}

function finish() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n── summary: ${pass} PASS · ${fail} FAIL · ${skip} SKIP ──\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("harness error:", e);
  process.exit(2);
});
