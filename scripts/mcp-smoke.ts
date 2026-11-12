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
 *   2. Settings → Integrations → Figma MCP → "Allow editing tools" is ON.
 *   3. The Figma MCP server is enabled (default) — reachable on the port below.
 *
 * Run:
 *   bun run scripts/mcp-smoke.ts                      # port 3845, the active tab
 *   bun run scripts/mcp-smoke.ts 4000                 # custom server port
 *   bun run scripts/mcp-smoke.ts --file <fileKey>     # a specific open file (recommended:
 *                                                     # point it at a scratch file, it writes)
 *   MCP_PORT=4000 bun run scripts/mcp-smoke.ts
 *
 * create_new_file is not exercised: it creates a real file in your drafts.
 *
 * FigJam tools (get_figjam, generate_diagram) need a FigJam file; they are
 * marked SKIP when a Design file is open.
 */

const args = process.argv.slice(2);
const fileFlag = args.indexOf("--file");
const FILE_KEY = fileFlag >= 0 ? args.splice(fileFlag, 2)[1] : process.env.MCP_FILE_KEY;
const PORT = Number(process.env.MCP_PORT ?? args[0] ?? 3845);
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
  const withFile = FILE_KEY && !("fileKey" in args) ? { ...args, fileKey: FILE_KEY } : args;
  const j = await rpc("tools/call", { name, arguments: withFile });
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
  console.log(`\n▶ Figma MCP smoke test — ${BASE}${FILE_KEY ? ` — file ${FILE_KEY}` : " — active tab"}\n`);

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
  if (probe.isError && /not available|No Figma window|not open|did not answer|not loaded yet|returned nothing/i.test(probe.text)) {
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

  // The React form (Figma's remote parameters): a component, with the node's screenshot appended.
  const react = await call("get_design_context", { nodeId: frameId, clientFrameworks: "react" });
  record(
    "get_design_context:react",
    /export default function \w+\(\)/.test(react.text) && /data-node-id=/.test(react.text) && react.hasImage
      ? "PASS"
      : "FAIL",
    react.hasImage ? "" : "no screenshot",
  );

  // Keyframes written with the Plugin API must come back through get_motion_context.
  await call("use_figma", {
    code: `const frame = await figma.getNodeByIdAsync(${JSON.stringify(frameId)}); const n = frame.children[0];
n.applyManualKeyframeTrack({ type: "PROPERTY", name: "OPACITY" }, { keyframes: [
  { timelinePosition: 0, value: { type: "FLOAT", value: 0 } },
  { timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } } ] });
return n.id;`,
  });
  const motion = parseJson((await call("get_motion_context", { nodeId: frameId, recursive: true })).text);
  const opacity = motion?.nodes?.[0]?.keyframes?.OPACITY?.keyframes;
  record(
    "get_motion_context",
    opacity?.[1]?.time === 0.5 && /cubic-bezier/.test(opacity?.[1]?.easing ?? "") ? "PASS" : "FAIL",
    motion?.nodes ? `${motion.nodes.length} animated layer(s)` : "no answer",
  );

  // Selection-sensitive: with a node selected it runs in selection mode, so assert
  // the tool returns a valid shape rather than requiring our file-wide variable.
  const vars = await call("get_variable_defs");
  record(
    "get_variable_defs",
    !vars.isError && /^(Used by|Local variables|No variables)/.test(vars.text) ? "PASS" : "FAIL",
    vars.text.split("\n")[0].slice(0, 60),
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

  // ── Remote-MCP parity (code, pages, queries, assets) ─────────────────────
  console.log("\n■ remote parity");
  const who = parseJson((await call("whoami")).text);
  record("whoami", who?.user?.id ? "PASS" : "FAIL", who?.currentFile?.fileKey ?? "");

  const versions = await call("get_versions", { limit: 3 });
  record("get_versions", /^Versions of this file/.test(versions.text) ? "PASS" : "FAIL", versions.text.split("\n")[0].slice(0, 50));
  const comments = await call("get_comments");
  record(
    "get_comments",
    !comments.isError && /^(No comments|\d+ comment thread)/.test(comments.text) ? "PASS" : "FAIL",
    comments.text.split("\n")[0].slice(0, 50),
  );

  const libs = await call("list_libraries");
  record("list_libraries", /^Libraries you can use/.test(libs.text) ? "PASS" : "FAIL", libs.text.split("\n")[0].slice(0, 50));
  const updates = await call("get_library_updates");
  record(
    "get_library_updates",
    !updates.isError && /library update|No pending library updates/.test(updates.text) ? "PASS" : "FAIL",
    updates.text.split("\n")[0].slice(0, 50),
  );

  // ── Figma AI tier: only the free calls; prompts and images spend credits ──
  console.log("\n■ figma ai (free calls only)");
  if (!toolNames.includes("figma_ai_credits")) {
    record("figma_ai_credits", "SKIP", "Figma AI tools are off in Settings");
    record("figma_agent_threads", "SKIP", "Figma AI tools are off in Settings");
  } else {
    const credits = parseJson((await call("figma_ai_credits")).text);
    record("figma_ai_credits", typeof credits?.you?.available === "number" ? "PASS" : "FAIL", credits?.you ? `${credits.you.available} available` : "");
    const threads = await call("figma_agent_threads");
    record(
      "figma_agent_threads",
      !threads.isError && /agent thread|No agent threads/.test(threads.text) ? "PASS" : "FAIL",
      threads.text.split("\n")[0].slice(0, 50),
    );
  }

  const pages = await call("get_metadata");
  record("get_metadata:pages", /<document[^>]*>[\s\S]*<page id=/.test(pages.text) ? "PASS" : "FAIL");

  const code = await call("use_figma", {
    description: "smoke: create a rectangle",
    code: "const r = figma.createRectangle(); r.name = 'MCP Smoke Code'; r.x = -5000; r.resize(40, 40); return { createdNodeIds: [r.id] };",
  });
  const codeId: string | undefined = parseJson(code.text)?.createdNodeIds?.[0];
  record("use_figma:code", codeId ? "PASS" : "FAIL", codeId ?? code.text.slice(0, 60));

  const failing = await call("use_figma", {
    code: "const r = figma.createRectangle(); r.name = 'MCP Smoke Rollback'; throw new Error('smoke rollback');",
  });
  const leftover = parseJson(
    (
      await call("use_figma", {
        code: "return figma.currentPage.findAll(n => n.name === 'MCP Smoke Rollback').length;",
      })
    ).text,
  );
  record(
    "use_figma:rollback",
    failing.isError && /were undone/.test(failing.text) && leftover === 0 ? "PASS" : "FAIL",
    failing.isError ? `${leftover} left` : "the throwing script reported success",
  );

  const syntax = await call("use_figma", { code: "return (1;" });
  record("use_figma:syntax", syntax.isError && /SyntaxError/.test(syntax.text) ? "PASS" : "FAIL");

  const queries = parseJson(
    (await call("search_design_system", { queries: [{ entity: "variable", query: varName }] })).text,
  );
  record("search_design_system:queries", queries?.results?.[0]?.total >= 1 ? "PASS" : "FAIL");

  const small = await call("get_screenshot", { nodeId: frameId, maxDimension: 64 });
  const smallMeta = parseJson(small.text);
  record(
    "get_screenshot:maxDimension",
    small.hasImage && Math.max(smallMeta?.width ?? 999, smallMeta?.height ?? 999) <= 64 ? "PASS" : "FAIL",
  );

  const assets = parseJson((await call("download_assets", { nodeId: frameId })).text);
  const exportOk = assets?.export?.url ? (await fetch(assets.export.url)).ok : false;
  record("download_assets", exportOk ? "PASS" : "FAIL", assets?.export?.format ?? "");

  if (codeId) {
    const ticket = parseJson((await call("upload_assets", { nodeIds: [codeId] })).text);
    const url: string | undefined = ticket?.uploads?.[0]?.url;
    // A 1x1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const posted = url
      ? await fetch(url, { method: "POST", headers: { "Content-Type": "image/png" }, body: png })
      : null;
    const fill = parseJson(
      (
        await call("use_figma", {
          code: `const n = await figma.getNodeByIdAsync(${JSON.stringify(codeId)}); return n.fills[0] && n.fills[0].type;`,
        })
      ).text,
    );
    record("upload_assets", posted?.ok && fill === "IMAGE" ? "PASS" : "FAIL", posted ? `HTTP ${posted.status}` : "no url");
    await call("use_figma", {
      code: `const n = await figma.getNodeByIdAsync(${JSON.stringify(codeId)}); if (n) n.remove(); return true;`,
    });
  } else {
    record("upload_assets", "SKIP", "no node to fill");
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
  const dropped = parseJson(
    (
      await call("use_figma", {
        description: "smoke: remove the variable collection it created",
        code: `const cs = await figma.variables.getLocalVariableCollectionsAsync(); let n = 0; for (const c of cs) if (c.name === ${JSON.stringify(`MCP Smoke ${runId}`)}) { c.remove(); n++; } return n;`,
      })
    ).text,
  );
  record("cleanup:variables", dropped === 1 ? "PASS" : "FAIL", `${dropped ?? "?"} collection(s)`);

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
