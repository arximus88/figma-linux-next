/**
 * ToolHandlers.ts — implementations of the MCP tools.
 *
 * One method per tool, plus the screenshot helpers and the exec() chokepoint.
 * Extracted verbatim from McpServer.ts (Phase 7 of decomposition); the only
 * change is that shared state (Figma view, logger, code-connect map, asset
 * store) is injected via ToolContext instead of read off `this`. The JSON-RPC
 * dispatcher in McpServer delegates here. No behavior change.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MCP_HOST } from "../config";
import {
  DESIGN_CONTEXT_SCRIPT,
  DESIGN_SYSTEM_RULES_SCRIPT,
  FIGJAM_SCRIPT,
  FILE_INFO_SCRIPT,
  FIND_NODES_SCRIPT,
  GENERATE_DIAGRAM_SCRIPT,
  METADATA_XML_SCRIPT,
  SCREENSHOT_SCRIPT,
  SEARCH_DESIGN_SYSTEM_QUERIES_SCRIPT,
  SEARCH_DESIGN_SYSTEM_SCRIPT,
  SET_TEXT_SCRIPT,
  TREE_SCRIPT,
  USE_FIGMA_SCRIPT,
  VARIABLE_DEFS_SCRIPT,
} from "../scripts";
import {
  checkUseFigmaSyntax,
  USE_FIGMA_CODE_SCRIPT,
  USE_FIGMA_MAX_CODE_CHARS,
} from "../scripts/useFigmaCode";
import {
  DOWNLOAD_ASSETS_SCRIPT,
  type DownloadOptions,
  RENAME_FILE_SCRIPT,
  UPLOAD_ASSET_SCRIPT,
  WHOAMI_SCRIPT,
} from "../scripts/assets";
import { COMMENTS_SCRIPT, VERSIONS_SCRIPT } from "../scripts/history";
import {
  CODE_CONNECT_SCRIPT,
  LIBRARY_STYLES_SCRIPT,
  LIBRARY_UPDATES_SCRIPT,
  LIST_LIBRARIES_SCRIPT,
} from "../scripts/libraries";
import {
  FIGMA_AGENT_PROMPT_SCRIPT,
  FIGMA_AGENT_READ_SCRIPT,
  FIGMA_AGENT_THREADS_SCRIPT,
} from "../scripts/figmaAgent";
import {
  type EditImageArgs,
  FIGMA_AI_CREDITS_SCRIPT,
  FIGMA_AI_EDIT_IMAGE_SCRIPT,
  FIGMA_AI_GENERATE_IMAGE_SCRIPT,
} from "../scripts/figmaAi";
import { fileKeysOfUrl } from "../utils/fileKey";
import {
  classifyUpload,
  newUploadToken,
  UPLOAD_MAX_PER_CALL,
  UPLOAD_TTL_MS,
  type UploadTicket,
} from "../utils/uploads";
import type { AssetEntry, CodeConnectEntry, FigmaViewProvider, Logger } from "../types";
import { parseMermaid } from "../utils/mermaid";
import { normalizeNodeId } from "../utils/nodeId";
import { safeStringify } from "../utils/serialize";
import { appendLogs, toolError, toolResult } from "../utils/toolResponse";

/** Shared state the tool handlers operate on, injected by McpServer. */
export interface ToolContext {
  /** Active Figma view (guaranteed non-null: McpServer guards before dispatch). */
  viewProvider: FigmaViewProvider;
  log: Logger;
  codeConnectMap: Map<string, CodeConnectEntry>;
  assetStore: Map<string, AssetEntry>;
  /** The port the MCP server is actually bound to (may differ from the default). */
  getPort: () => number;
  /**
   * Base directory for a relative `savePath`.
   *
   * Never `process.cwd()`: in a packaged app that is wherever the launcher
   * happened to start the process (often `/`), which has nothing to do with the
   * MCP client's working directory. A relative path used to be resolved against
   * it, so the write succeeded and reported an accurate absolute `savedTo` —
   * just nowhere near where the caller was looking. Defaults to the app's
   * configured export directory.
   */
  getSaveBaseDir: () => string;
  /** How long a script in the page may take before the tool gives up. Tests shorten it. */
  scriptTimeoutMs?: number;
  /** upload_assets tickets, shared with the HTTP route that receives the bytes. */
  uploads?: Map<string, UploadTicket>;
  /** The file these handlers are bound to (fileKey argument), if any. */
  fileKey?: string;
}

const DESIGN_SYSTEM_ENTITIES = new Set(["component", "variable", "style"]);

/** figma.com path segment of a new file per editor type. */
const NEW_FILE_PATHS: Record<string, string> = {
  design: "design",
  figjam: "board",
  slides: "slides",
};

/** How long download_assets / screenshot URLs stay fetchable. */
const ASSET_TTL_MS = 10 * 60 * 1000;

/**
 * Validate search_design_system `queries` the way Figma's remote tool expects
 * them. Returns the cleaned list, or an error message that shows the right
 * shape (agents often pass plain strings).
 */
export function parseDesignSystemQueries(
  value: unknown,
): { entity: string; query: string }[] | string {
  const shape = 'queries must be an array of objects like {"entity":"component","query":"button"}';
  if (!Array.isArray(value) || value.length === 0) return shape;
  if (value.length > 20) return "At most 20 queries per call.";
  const out: { entity: string; query: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return `${shape}; got ${JSON.stringify(item)}`;
    const { entity, query } = item as Record<string, unknown>;
    if (typeof entity !== "string" || !DESIGN_SYSTEM_ENTITIES.has(entity)) {
      return `entity must be "component", "variable" or "style"; got ${JSON.stringify(entity)}`;
    }
    if (typeof query !== "string" || !query.trim())
      return `every query needs a non-empty "query" string`;
    out.push({ entity, query: query.trim() });
  }
  return out;
}

export class ToolHandlers {
  constructor(private ctx: ToolContext) {}

  /**
   * Run a script in the active Figma tab. Single chokepoint for view access.
   *
   * Bounded: a call Figma never answers (a raster exportAsync that stalled was
   * seen live) used to hang the tool, and the MCP client with it, for good.
   * executeJavaScript cannot be cancelled, so the script may still finish in
   * the page; the caller just stops waiting and gets an error it can act on.
   */
  private async exec(script: string, timeoutMs?: number): Promise<any> {
    const ms = timeoutMs ?? this.ctx.scriptTimeoutMs ?? 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Figma did not answer within ${Math.round(ms / 1000)} s. ` +
                "The tab may still be loading or busy; retry, or switch to the tab in the app first.",
            ),
          ),
        ms,
      );
    });
    try {
      return await Promise.race([this.ctx.viewProvider.executeInBrowserView(script), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Run a script with a print()/logs channel. The script (a self-contained IIFE
   * expression) is inlined into a wrapper that exposes a `print(...)` function in
   * its lexical scope and captures emitted lines into `__logs`. The wrapper
   * preserves the promise path (some scripts return a Promise) and always
   * resolves to a structured-clone-safe `{__logs, __result}`.
   *
   * Backward-compatible: scripts that never call print() simply return empty
   * logs. Only the new tools use this path; the 11 existing tools keep exec().
   */
  private async execWithLogs(script: string): Promise<{ result: any; logs: string[] }> {
    const wrapped = `
(function () {
  var __logs = [];
  var print = function () {
    try { __logs.push(Array.prototype.map.call(arguments, function (a) {
      return (typeof a === 'string') ? a : JSON.stringify(a); }).join(' ')); }
    catch (e) { __logs.push(String(arguments[0])); }
  };
  var __r;
  try { __r = (${script}); }
  catch (e) { return { __logs: __logs, __result: { error: e.message || String(e) } }; }
  if (__r && typeof __r.then === 'function') {
    return __r.then(function (v) { return { __logs: __logs, __result: v }; })
              .catch(function (e) { return { __logs: __logs, __result: { error: e.message || String(e) } }; });
  }
  return { __logs: __logs, __result: __r };
})()`;

    const raw = await this.exec(wrapped);
    let obj: any;
    try {
      obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      this.ctx.log.error("Failed to parse execWithLogs result:", err);
      obj = null;
    }
    return {
      result: obj?.__result,
      logs: Array.isArray(obj?.__logs) ? obj.__logs : [],
    };
  }

  // ── Tool: get_design_context ─────────────────────────────────────────────

  public async toolGetDesignContext(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const depth = typeof args.depth === "number" ? args.depth : 10;

    const script = DESIGN_CONTEXT_SCRIPT(nodeId, depth);
    const raw = await this.exec(script);

    // Script returns a JSON string to avoid V8 structured-clone failures over IPC
    let result: any;
    try {
      result = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return toolError(
        "Failed to deserialize design context — the Figma scene graph may contain non-serializable objects",
      );
    }

    if (result?.error) {
      return toolError(result.error);
    }

    const text = String(result?.text ?? "");
    const approxTokens = Math.round(text.length / 3.5);
    if (approxTokens > 20_000) {
      return toolResult(
        `⚠ Large response (~${(approxTokens / 1000).toFixed(1)}k tokens). ` +
          "Call get_metadata on this node and ask for its parts, or pass a smaller depth.\n\n" +
          text,
      );
    }
    return toolResult(text);
  }

  // ── Tool: get_metadata ───────────────────────────────────────────────────

  public async toolGetMetadata(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const depth = typeof args.depth === "number" ? args.depth : 8;

    const script = METADATA_XML_SCRIPT(nodeId, depth);
    const raw = await this.exec(script);

    let result: any;
    try {
      result = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return toolError("Failed to deserialize metadata response");
    }

    if (result?.error) {
      return toolError(result.error);
    }

    return toolResult(result.xml ?? "");
  }

  // ── Tool: get_file_info ──────────────────────────────────────────────────

  public async toolGetFileInfo() {
    const result = await this.exec(FILE_INFO_SCRIPT);

    if (result?.error) {
      return toolError(result.error);
    }

    return toolResult(safeStringify(result));
  }

  // ── Tool: get_screenshot ─────────────────────────────────────────────────

  public async toolGetScreenshot(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const scale = typeof args.scale === "number" ? Math.min(4, Math.max(0.01, args.scale)) : null;
    const maxDimension =
      typeof args.maxDimension === "number" && args.maxDimension > 0
        ? Math.min(65536, Math.round(args.maxDimension))
        : 1024;
    const contentsOnly = args.contentsOnly === true;
    const savePath = args.savePath ? String(args.savePath) : null;

    // Try Plugin API exportAsync first
    const script = SCREENSHOT_SCRIPT(nodeId, { scale, maxDimension, contentsOnly });
    const result = await this.exec(script);

    if (result?.error) {
      this.ctx.log.warn("Plugin API export failed:", result.error);

      // The capturePage fallback grabs the whole editor window: canvas, layers
      // panel, toolbar and all. That is a reasonable stand-in for "screenshot
      // what I'm looking at", and no substitute whatsoever for "export node X"
      // — it ignores `scale` and returns the same image for every node asked
      // for. Returning it as a success turned a batch of node exports into a
      // pile of byte-identical window captures that all reported `savedTo`.
      if (nodeId) {
        return toolError(
          `Could not export node ${nodeId}: ${result.error}. ` +
            "Screenshot not saved. Retry once the file is fully loaded, or call " +
            "get_screenshot without a nodeId to capture the visible window instead.",
        );
      }

      this.ctx.log.warn("Falling back to capturePage for the visible window");
      return this.capturePageFallback(
        savePath,
        result.noSelection
          ? "Nothing is selected, so this is a capture of the whole window, not a node export. Select a node or pass a nodeId to export it. `scale` was not applied."
          : `${result.error}. This is a capture of the whole window, not a node export. \`scale\` was not applied.`,
      );
    }

    if (result?.base64) {
      const { width, height, original_width, original_height } = result;
      return this.buildScreenshotResponse(result.base64, result.nodeId, result.nodeName, savePath, {
        width,
        height,
        original_width,
        original_height,
        scale: result.scale,
      });
    }

    return toolError("Screenshot export returned no data");
  }

  /** Build an MCP response with the image inline + optional disk save. */
  private async buildScreenshotResponse(
    base64: string,
    nodeId: string,
    nodeName: string,
    savePath: string | null,
    extraMeta?: Record<string, unknown>,
  ) {
    type ContentItem = { type: string; data?: string; mimeType?: string; text?: string };
    const content: ContentItem[] = [{ type: "image", data: base64, mimeType: "image/png" }];

    const meta: Record<string, unknown> = { nodeId, nodeName, ...extraMeta };

    if (savePath) {
      // Resolving can throw too (app.getPath), so it sits inside the try: a
      // failure there is a saveError, not a failed tool call.
      let absPath = savePath;
      try {
        absPath = this.resolveSavePath(savePath);
        if (!path.isAbsolute(savePath)) {
          // Say so explicitly: the caller's idea of "here" is not the app's.
          meta.resolvedFrom = this.ctx.getSaveBaseDir();
        }
        // Async FS so a slow disk doesn't block the Electron main thread.
        await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
        await fs.promises.writeFile(absPath, Buffer.from(base64, "base64"));
        meta.savedTo = absPath;
        this.ctx.log.info(`get_screenshot saved ${absPath}`);
      } catch (e: any) {
        meta.saveError = `${absPath}: ${e.message}`;
        this.ctx.log.error(`get_screenshot could not write ${absPath}: ${e.message}`);
      }
    }

    content.push({ type: "text", text: JSON.stringify(meta, null, 2) });
    return { content };
  }

  /**
   * Absolute path for a requested `savePath`. A relative one resolves against
   * the app's export directory — see ToolContext.getSaveBaseDir for why not
   * `process.cwd()`.
   */
  private resolveSavePath(savePath: string): string {
    if (path.isAbsolute(savePath)) return savePath;
    return path.resolve(this.ctx.getSaveBaseDir(), savePath);
  }

  /**
   * Fallback: Electron's capturePage on the webContents — the whole visible
   * window, not a node. Only reached when no nodeId was asked for; the result
   * is marked so a caller can tell it apart from a real node export.
   */
  private async capturePageFallback(savePath: string | null, degraded: string) {
    const view = this.ctx.viewProvider.getActiveTabView();
    if (!view) return toolError("No active Figma view");

    const image = await view.webContents.capturePage();
    const buffer = image.toPNG();
    return this.buildScreenshotResponse(
      buffer.toString("base64"),
      "",
      "canvas (capturePage fallback)",
      savePath,
      { degraded },
    );
  }

  // ── Tool: get_variable_defs ──────────────────────────────────────────────

  public async toolGetVariableDefs(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const result = await this.exec(VARIABLE_DEFS_SCRIPT(nodeId));
    if (result?.error) return toolError(result.error);
    return toolResult(String(result?.text ?? ""));
  }

  // ── Tool: get_code_connect_map ───────────────────────────────────────────

  public toolGetCodeConnectMap() {
    const map: Record<string, { codeConnectSrc: string; codeConnectName: string }> = {};
    for (const [nodeId, entry] of this.ctx.codeConnectMap) {
      map[nodeId] = {
        codeConnectSrc: entry.codeConnectSrc,
        codeConnectName: entry.codeConnectName,
      };
    }

    return toolResult(
      JSON.stringify(
        {
          mappings: map,
          count: this.ctx.codeConnectMap.size,
        },
        null,
        2,
      ),
    );
  }

  // ── Tool: get_figjam ─────────────────────────────────────────────────────

  public async toolGetFigjam(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const script = FIGJAM_SCRIPT(nodeId);
    const result = await this.exec(script);

    if (result?.error) {
      return toolError(result.error);
    }

    // Try to capture screenshots of top nodes
    const screenshots: Record<string, string> = {};
    if (result.nodeIds?.length > 0) {
      for (const nid of result.nodeIds.slice(0, 5)) {
        try {
          const ssScript = SCREENSHOT_SCRIPT(nid, {
            scale: 1,
            maxDimension: 1024,
            contentsOnly: false,
          });
          const ssResult = await this.exec(ssScript);
          if (ssResult?.base64) {
            const buffer = Buffer.from(ssResult.base64, "base64");
            const assetId = `${crypto.randomUUID()}.png`;
            this.ctx.assetStore.set(assetId, { data: buffer, contentType: "image/png" });
            setTimeout(() => this.ctx.assetStore.delete(assetId), 10 * 60 * 1000);
            screenshots[nid] = `http://${MCP_HOST}:${this.ctx.getPort()}/assets/${assetId}`;
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

    return toolResult(xml);
  }

  // ── Tool: generate_diagram ───────────────────────────────────────────────

  public async toolGenerateDiagram(args: Record<string, unknown>) {
    const mermaid = args.mermaid as string;
    if (!mermaid) {
      return toolError("Missing required field: mermaid (Mermaid diagram syntax)");
    }

    const { nodes, edges } = parseMermaid(mermaid);
    if (nodes.length === 0) {
      return toolError("Could not parse any nodes from the Mermaid syntax.");
    }

    const nodesWithEdges = nodes.map((n) => ({
      ...n,
      _edges: edges.filter((e) => e.from === n.id),
    }));
    const nodesJson = JSON.stringify(nodesWithEdges);
    const script = GENERATE_DIAGRAM_SCRIPT(nodesJson);
    const result = await this.exec(script);

    if (result?.error) {
      return toolError(result.error);
    }

    return toolResult(
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

  // ── Tool: add_code_connect_map ───────────────────────────────────────────

  public toolAddCodeConnectMap(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const codeConnectSrc = args.codeConnectSrc as string;
    const codeConnectName = args.codeConnectName as string;

    if (!nodeId || !codeConnectSrc || !codeConnectName) {
      return toolError("Missing required fields: nodeId, codeConnectSrc, codeConnectName");
    }

    this.ctx.codeConnectMap.set(nodeId, { nodeId, codeConnectSrc, codeConnectName });
    this.ctx.log.info(
      "Code Connect mapping added:",
      nodeId,
      "→",
      codeConnectName,
      `(${codeConnectSrc})`,
    );

    return toolResult(
      JSON.stringify(
        {
          success: true,
          nodeId,
          codeConnectSrc,
          codeConnectName,
          totalMappings: this.ctx.codeConnectMap.size,
        },
        null,
        2,
      ),
    );
  }

  // ── Tool: create_design_system_rules ─────────────────────────────────────

  public async toolCreateDesignSystemRules(args: Record<string, unknown>) {
    const techStack = (args.techStack as string) || "Not specified";
    const componentLibraryPath = (args.componentLibraryPath as string) || "Not specified";

    // Collect design system data from Figma
    const result = await this.exec(DESIGN_SYSTEM_RULES_SCRIPT);

    if (result?.error) {
      return toolError(result.error);
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
    if (this.ctx.codeConnectMap.size > 0) {
      lines.push("## Code Connect Mappings", "");
      lines.push("| Figma Node ID | Component | File |", "|---------------|-----------|------|");
      for (const [_, entry] of this.ctx.codeConnectMap) {
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

    return toolResult(lines.join("\n"));
  }

  // ── Tool: search_design_system ──────────────────────────────────────────

  public async toolSearchDesignSystem(args: Record<string, unknown>) {
    if (args.queries !== undefined) {
      const parsed = parseDesignSystemQueries(args.queries);
      if (typeof parsed === "string") return toolError(parsed);
      const keys = Array.isArray(args.includeLibraryKeys)
        ? args.includeLibraryKeys.filter((k): k is string => typeof k === "string")
        : null;
      const result = await this.exec(
        SEARCH_DESIGN_SYSTEM_QUERIES_SCRIPT(
          JSON.stringify(parsed),
          JSON.stringify(keys?.length ? keys : null),
        ),
      );
      if (result?.error) return toolError(result.error);
      return toolResult(safeStringify(result, 0));
    }

    // Legacy single `query`: every entity, the original response shape.
    const query = (args.query as string) || "";
    if (!query)
      return toolError("Pass `queries`: [{ entity: 'component' | 'variable' | 'style', query }].");

    const result = await this.exec(SEARCH_DESIGN_SYSTEM_SCRIPT(query));
    if (result?.error) return toolError(result.error);
    return toolResult(safeStringify(result));
  }

  // ── Tool: use_figma (write) ─────────────────────────────────────────────

  public async toolUseFigma(args: Record<string, unknown>) {
    if (typeof args.code === "string") return this.runUseFigmaCode(args.code, args.description);

    const action = args.action as string;
    const params = args.params as Record<string, unknown>;
    if (!action)
      return toolError("Pass `code` (Plugin API JavaScript), or the legacy `action` + `params`.");
    if (!params) return toolError("params is required");

    const paramsJson = JSON.stringify(params);
    const result = await this.exec(USE_FIGMA_SCRIPT(action, paramsJson));
    if (result?.error) return toolError(result.error);
    return toolResult(safeStringify(result));
  }

  /** use_figma with `code`: see scripts/useFigmaCode.ts for the contract. */
  private async runUseFigmaCode(code: string, description: unknown) {
    if (!code.trim()) return toolError("code is empty");
    if (code.length > USE_FIGMA_MAX_CODE_CHARS) {
      return toolError(
        `code is ${code.length} characters; the limit is ${USE_FIGMA_MAX_CODE_CHARS}. Split the work into several calls.`,
      );
    }
    const syntaxError = checkUseFigmaSyntax(code);
    if (syntaxError) {
      return toolError(
        `SyntaxError: ${syntaxError}. Nothing was run. The code is the body of an async function: use top-level await and return, no wrapping IIFE.`,
      );
    }
    if (typeof description === "string" && description) {
      this.ctx.log.info(`use_figma: ${description.slice(0, 200)}`);
    }

    const out = await this.exec(USE_FIGMA_CODE_SCRIPT(code));
    if (!out || typeof out !== "object") {
      return toolError(
        "The Figma tab returned nothing. It may be reloading; retry once it has loaded.",
      );
    }
    if (typeof out.error === "string") {
      const parts = [out.error];
      if (out.rolledBack) {
        parts.push(
          "Any changes the script made before the error were undone; the file is as it was.",
        );
      } else if (out.note) {
        parts.push(out.note);
      }
      return toolError(parts.join(" "));
    }
    const text = out.truncated
      ? `${out.result}\n\n[truncated: the result was ${out.length} characters; return less, e.g. ids instead of whole objects]`
      : (out.result ?? "null");
    return toolResult(text);
  }

  // ── Tool: create_new_file (write) ────────────────────────────────────────

  /**
   * A real new file, like Figma's remote create_new_file (this used to add a
   * page; use_figma with figma.createPage() does that now). The file is
   * created the way the app's own "New design file" button does it — a tab on
   * figma.com/<editor>/new — and lands in the drafts of the account's current
   * team. Figma gives it a key once the editor has saved it, which is what
   * this waits for; then it is renamed through the web app's own endpoint,
   * since figma.root.name is read-only in the page.
   */
  public async toolCreateNewFile(args: Record<string, unknown>) {
    const open = this.ctx.viewProvider.openNewFileTab?.bind(this.ctx.viewProvider);
    if (!open) return toolError("Creating files needs an app window; none is open.");
    const editorType = (args.editorType as string) || "design";
    const path = NEW_FILE_PATHS[editorType];
    if (!path)
      return toolError(`editorType must be one of ${Object.keys(NEW_FILE_PATHS).join(", ")}`);
    const fileName = String(args.fileName ?? args.name ?? "").trim();

    const url = await open(`https://www.figma.com/${path}/new`);
    const fileKey = fileKeysOfUrl(url)[0];
    if (!fileKey) return toolError(`The new file opened but has no key yet (${url}).`);

    const result: Record<string, unknown> = { fileKey, url: url.split("?")[0], editorType };
    if (fileName) {
      const renamed = await this.ctx.viewProvider.executeInBrowserView(
        RENAME_FILE_SCRIPT(fileKey, fileName),
        fileKey,
      );
      if (renamed?.ok) result.fileName = fileName;
      else result.renameError = renamed?.error ?? "rename failed";
    }
    if (args.planKey || args.projectId) {
      result.note =
        "planKey/projectId are not applied: the file is created in your drafts, like the app's New file button. Move it in Figma if needed.";
    }
    return toolResult(safeStringify(result));
  }

  // ── Tool: whoami (read) ──────────────────────────────────────────────────

  public async toolWhoami() {
    const result = await this.exec(WHOAMI_SCRIPT);
    if (!result) return toolError("The Figma tab returned nothing; it may still be loading.");
    return toolResult(safeStringify(result));
  }

  // ── Libraries and Code Connect (read) ────────────────────────────────────

  private async textTool(script: string) {
    const out = await this.exec(script);
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return toolResult(String(out.text));
  }

  public toolListLibraries() {
    return this.textTool(LIST_LIBRARIES_SCRIPT);
  }

  public toolGetLibraryStyles(args: Record<string, unknown>) {
    const library = typeof args.library === "string" ? args.library.trim() : "";
    if (!library) return toolError("library is required: a name from list_libraries");
    return this.textTool(
      LIBRARY_STYLES_SCRIPT(library, typeof args.query === "string" ? args.query.trim() : ""),
    );
  }

  public toolGetLibraryUpdates() {
    return this.textTool(LIBRARY_UPDATES_SCRIPT);
  }

  public toolGetCodeConnect(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    if (!nodeId)
      return toolError("nodeId is required: an instance or a frame containing instances");
    return this.textTool(
      CODE_CONNECT_SCRIPT(nodeId, typeof args.label === "string" && args.label ? args.label : null),
    );
  }

  // ── Figma AI tier: agent, images, credits ────────────────────────────────

  public async toolFigmaAgentPrompt(args: Record<string, unknown>) {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return toolError("prompt is required");
    const timeoutMs =
      Math.min(
        900,
        Math.max(
          10,
          typeof args.timeoutSeconds === "number" ? args.timeoutSeconds : AGENT_WAIT_SECONDS,
        ),
      ) * 1000;
    const nodeIds = Array.isArray(args.nodeIds)
      ? args.nodeIds.map((n) => normalizeNodeId(n)).filter((n): n is string => !!n)
      : [];
    const out = await this.exec(
      FIGMA_AGENT_PROMPT_SCRIPT({
        prompt,
        threadId: typeof args.threadId === "string" && args.threadId ? args.threadId : null,
        selectedNodeIds: nodeIds,
        title: typeof args.title === "string" && args.title ? args.title : null,
        timeoutMs,
      }),
      timeoutMs + 30_000,
    );
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return toolResult(formatAgentExchange(out));
  }

  public async toolFigmaAgentThreads() {
    const out = await this.exec(FIGMA_AGENT_THREADS_SCRIPT);
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return toolResult(String(out.text));
  }

  public async toolFigmaAgentRead(args: Record<string, unknown>) {
    const threadId = typeof args.threadId === "string" ? args.threadId.trim() : "";
    if (!threadId) return toolError("threadId is required (figma_agent_threads lists them)");
    const last = typeof args.last === "number" ? args.last : 3;
    const out = await this.exec(FIGMA_AGENT_READ_SCRIPT(threadId, last));
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    const body = (out.exchanges as any[])
      .map(
        (ex, i) =>
          `── exchange ${out.total - out.exchanges.length + i + 1} of ${out.total} ──\n` +
          formatAgentExchange({ ...ex, prompt: ex.prompt }),
      )
      .join("\n\n");
    return toolResult(`Thread ${threadId}\n${body}`);
  }

  public async toolFigmaAiCredits() {
    const out = await this.exec(FIGMA_AI_CREDITS_SCRIPT);
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return toolResult(safeStringify(out, 0));
  }

  public async toolFigmaAiGenerateImage(args: Record<string, unknown>) {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return toolError("prompt is required");
    const dim = (v: unknown) =>
      typeof v === "number" && v > 0 ? Math.min(4096, Math.max(64, Math.round(v))) : 1024;
    const model = typeof args.model === "string" && args.model ? args.model : DEFAULT_IMAGE_MODEL;
    const out = await this.exec(
      FIGMA_AI_GENERATE_IMAGE_SCRIPT({
        prompt,
        negativePrompt: typeof args.negativePrompt === "string" ? args.negativePrompt : null,
        width: dim(args.width),
        height: dim(args.height),
        model,
        seed: typeof args.seed === "number" ? Math.round(args.seed) : null,
        place: args.placeOnCanvas !== false,
        previewMax: 512,
      }),
      180_000,
    );
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return this.aiImageResponse(out, args.savePath, prompt);
  }

  public async toolFigmaAiEditImage(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    if (!nodeId) return toolError("nodeId is required: a layer with an image fill");
    const ops = ["edit", "expand", "remove_background", "upscale", "vectorize"] as const;
    const operation = ops.find((o) => o === args.operation);
    if (!operation) return toolError(`operation must be one of ${ops.join(", ")}`);
    const e = (args.expand ?? {}) as Record<string, unknown>;
    const px = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v) : 0);
    const editArgs: EditImageArgs = {
      nodeId,
      operation,
      prompt: typeof args.prompt === "string" && args.prompt.trim() ? args.prompt.trim() : null,
      model: typeof args.model === "string" && args.model ? args.model : DEFAULT_IMAGE_MODEL,
      expand:
        operation === "expand"
          ? { top: px(e.top), right: px(e.right), bottom: px(e.bottom), left: px(e.left) }
          : null,
      scale: args.scale === 4 ? 4 : 2,
      replace: args.replace === true,
      previewMax: 512,
    };
    const out = await this.exec(FIGMA_AI_EDIT_IMAGE_SCRIPT(editArgs), 180_000);
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return this.aiImageResponse(out, args.savePath, `${operation}-${nodeId}`);
  }

  /** Save what Figma AI made to disk; answer with a small preview and the facts. */
  private async aiImageResponse(out: any, savePathArg: unknown, label: string) {
    const isSvg = typeof out.svg === "string";
    const slug =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "image";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const requested = typeof savePathArg === "string" && savePathArg ? savePathArg : null;
    const absPath = this.resolveSavePath(
      requested ?? path.join("figma-ai", `${stamp}-${slug}.${isSvg ? "svg" : "png"}`),
    );
    const meta: Record<string, unknown> = {
      ms: out.ms,
      model: out.model,
      placed: out.placed ?? undefined,
      creditsBefore: out.creditsBefore,
      creditsAfter: out.creditsAfter,
      creditsSpent:
        typeof out.creditsBefore === "number" && typeof out.creditsAfter === "number"
          ? out.creditsBefore - out.creditsAfter
          : undefined,
    };
    try {
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
      await fs.promises.writeFile(absPath, isSvg ? out.svg : Buffer.from(out.base64, "base64"));
      meta.savedTo = absPath;
    } catch (e: any) {
      meta.saveError = `${absPath}: ${e.message}`;
    }
    const content: { type: string; data?: string; mimeType?: string; text?: string }[] = [];
    if (out.preview) content.push({ type: "image", data: out.preview, mimeType: "image/jpeg" });
    content.push({ type: "text", text: safeStringify(meta, 0) });
    return { content };
  }

  // ── Tool: get_comments / get_versions (read) ─────────────────────────────

  public async toolGetComments(args: Record<string, unknown>) {
    const out = await this.exec(COMMENTS_SCRIPT(args.includeResolved === true));
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return toolResult(String(out.text));
  }

  public async toolGetVersions(args: Record<string, unknown>) {
    const limit =
      typeof args.limit === "number" ? Math.min(100, Math.max(1, Math.round(args.limit))) : 20;
    const out = await this.exec(VERSIONS_SCRIPT(limit, args.namedOnly === true));
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);
    return toolResult(String(out.text));
  }

  // ── Tool: download_assets (read) ─────────────────────────────────────────

  public async toolDownloadAssets(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    if (!nodeId) return toolError("nodeId is required");
    const format = args.defaultFormat as DownloadOptions["format"] | undefined;
    if (format && !["png", "jpg", "svg", "pdf"].includes(format)) {
      return toolError("defaultFormat must be png, jpg, svg or pdf");
    }
    const scale =
      typeof args.defaultScale === "number" ? Math.min(4, Math.max(0.01, args.defaultScale)) : null;

    const out = await this.exec(DOWNLOAD_ASSETS_SCRIPT(nodeId, { format: format ?? null, scale }));
    if (!out) return toolError("The Figma tab returned nothing; it may still be loading.");
    if (out.error) return toolError(out.error);

    const MIME: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
    };
    const store = (data: Buffer, ext: string) => {
      const id = `${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext === "original" ? "bin" : ext}`;
      this.ctx.assetStore.set(id, { data, contentType: MIME[ext] ?? "application/octet-stream" });
      setTimeout(() => this.ctx.assetStore.delete(id), ASSET_TTL_MS);
      return `http://${MCP_HOST}:${this.ctx.getPort()}/assets/${id}`;
    };

    const response = {
      nodeId: out.nodeId,
      nodeName: out.nodeName,
      export: {
        url: store(Buffer.from(out.export.base64, "base64"), out.export.format),
        format: out.export.format,
        scale: out.export.scale,
      },
      rawImages: (out.rawImages ?? []).map((img: any) => ({
        url: store(Buffer.from(img.base64, "base64"), img.format),
        format: img.format,
        imageHash: img.imageHash,
        width: img.width,
        height: img.height,
      })),
      svgAssets: (out.svgAssets ?? []).map((svg: any) => ({
        url: store(Buffer.from(svg.svg, "utf8"), "svg"),
        format: "svg",
        nodeId: svg.nodeId,
        name: svg.name,
        width: svg.width,
        height: svg.height,
      })),
      notes: out.notes,
      expiresInSeconds: ASSET_TTL_MS / 1000,
      howToDownload: "curl -o <file> <url>; the URLs are local to this machine and expire.",
    };
    return toolResult(safeStringify(response));
  }

  // ── Tool: upload_assets (write) ──────────────────────────────────────────

  public async toolUploadAssets(args: Record<string, unknown>) {
    if (!this.ctx.uploads) return toolError("Uploads are not available in this server.");
    const nodeIds: (string | null)[] = Array.isArray(args.nodeIds)
      ? args.nodeIds.map((id) => normalizeNodeId(id))
      : args.nodeId
        ? [normalizeNodeId(args.nodeId)]
        : [];
    const count = nodeIds.length || (typeof args.count === "number" ? Math.floor(args.count) : 1);
    if (count < 1 || count > UPLOAD_MAX_PER_CALL) {
      return toolError(`count must be between 1 and ${UPLOAD_MAX_PER_CALL}`);
    }
    if (typeof args.count === "number" && nodeIds.length && nodeIds.length !== args.count) {
      return toolError("nodeIds must have exactly `count` entries, one per upload URL");
    }
    const scaleMode = (args.scaleMode as UploadTicket["scaleMode"]) || "FILL";
    if (!["FILL", "FIT", "TILE"].includes(scaleMode))
      return toolError("scaleMode must be FILL, FIT or TILE");
    const pageId = normalizeNodeId(args.currentPageId);

    const uploads = [];
    for (let i = 0; i < count; i++) {
      const token = newUploadToken();
      const targetNodeId = nodeIds[i] ?? null;
      this.ctx.uploads.set(token, {
        fileKey: this.ctx.fileKey,
        targetNodeId,
        scaleMode,
        pageId,
        expiresAt: Date.now() + UPLOAD_TTL_MS,
      });
      uploads.push({
        url: `http://${MCP_HOST}:${this.ctx.getPort()}/upload/${token}`,
        ...(targetNodeId ? { targetNodeId } : {}),
      });
    }
    return toolResult(
      safeStringify({
        uploads,
        expiresInSeconds: UPLOAD_TTL_MS / 1000,
        howToUpload:
          "POST the raw bytes to each URL once, with the real Content-Type: " +
          "curl -X POST -H 'Content-Type: image/png' --data-binary @image.png <url>. " +
          "PNG, JPEG, GIF, WebP or SVG, up to 10 MB. The response names the node that was created or filled.",
      }),
    );
  }

  /** Place the bytes POSTed to an upload URL. Called by the HTTP route. */
  public async placeUpload(
    ticket: UploadTicket,
    contentType: string | undefined,
    body: Uint8Array,
  ) {
    const kind = classifyUpload(contentType, body);
    if (typeof kind !== "string") return { error: kind.error };
    const base64 = Buffer.from(body).toString("base64");
    const out = await this.exec(UPLOAD_ASSET_SCRIPT(base64, kind, ticket));
    return out ?? { error: "The Figma tab returned nothing; it may still be loading." };
  }

  // ── Tool: figma_find (read) ──────────────────────────────────────────────

  public async toolFigmaFind(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const opts = {
      query: typeof args.query === "string" ? args.query : null,
      type: typeof args.type === "string" ? args.type : null,
      text: typeof args.text === "string" ? args.text : null,
      limit: typeof args.limit === "number" ? args.limit : 100,
    };

    const result = await this.exec(FIND_NODES_SCRIPT(nodeId, JSON.stringify(opts)));
    if (result?.error) return toolError(result.error);
    return toolResult(safeStringify(result));
  }

  // ── Tool: figma_tree (read) ──────────────────────────────────────────────

  public async toolFigmaTree(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const maxDepth = typeof args.maxDepth === "number" ? args.maxDepth : 5;

    const { result, logs } = await this.execWithLogs(TREE_SCRIPT(nodeId, maxDepth));
    if (result?.error) return toolError(result.error);
    return toolResult(appendLogs(result?.tree ?? "", logs));
  }

  // ── Tool: figma_text (write) ─────────────────────────────────────────────

  public async toolFigmaText(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    if (!nodeId) return toolError("nodeId is required");
    if (typeof args.characters !== "string") return toolError("characters is required");

    const result = await this.exec(SET_TEXT_SCRIPT(nodeId, JSON.stringify(args.characters)));
    if (result?.error) return toolError(result.error);
    return toolResult(safeStringify(result));
  }
}

/** Figma AI's default image model: the one Figma's own "Make image" picks. */
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-lite-image";

/** One agent exchange as compact text: outcome, answer, tool calls, changed nodes. */
/**
 * How long figma_agent_prompt waits by default. MCP clients give up on a call
 * after about a minute (Claude Code aborted a 5-minute agent run at ~60 s on
 * 2026-11-06, losing the answer and the credits it cost; a 40 s wait was still
 * cut off), so the tool returns the thread id well before that and the caller
 * reads the rest later.
 */
export const AGENT_WAIT_SECONDS = 20;

export function formatAgentExchange(ex: any): string {
  const lines: string[] = [];
  const head = [
    ex.threadId ? `thread ${ex.threadId}` : null,
    ex.outcome ?? ex.state ?? null,
    ex.pending ?? null,
    typeof ex.ms === "number" ? `${Math.round(ex.ms / 1000)} s` : null,
    typeof ex.credits === "number" ? `${ex.credits} credits` : null,
  ].filter(Boolean);
  if (head.length) lines.push(head.join(" · "));
  if (ex.note) lines.push(ex.note);
  if (Array.isArray(ex.codeLayerThreads) && ex.codeLayerThreads.length) {
    lines.push(
      `Code layer built in Figma Make thread ${ex.codeLayerThreads.join(", ")} (figma_agent_read shows its file edits). ` +
        "The credits above leave out the build itself, which Figma bills to Make and does not report per prompt (a Svelte screen cost about 80); compare figma_ai_credits before and after.",
    );
  }
  if (ex.prompt) lines.push(`Prompt: ${ex.prompt}`);
  if (ex.answer) lines.push(`Answer:\n${ex.answer}`);
  const calls = Array.isArray(ex.toolCalls) ? ex.toolCalls : [];
  if (calls.length) {
    lines.push(`Tool calls (${calls.length}):`);
    for (const c of calls) {
      const mark = c.ok === false ? "failed" : c.ok ? "ok" : "?";
      lines.push(
        `- ${c.tool}${c.label ? ` "${c.label}"` : ""} · ${mark}${c.code ? ` · ${c.code}` : ""}`,
      );
    }
  }
  const ch = ex.changed;
  if (ch && (ch.created?.length || ch.modified?.length || ch.deleted?.length)) {
    const part = (k: string, ids: string[]) =>
      ids?.length
        ? `${k} ${ids.length}: ${ids.slice(0, 30).join(", ")}${ids.length > 30 ? ", …" : ""}`
        : null;
    lines.push(
      `Changed nodes: ${[
        part("created", ch.created),
        part("modified", ch.modified),
        part("deleted", ch.deleted),
      ]
        .filter(Boolean)
        .join("; ")}`,
    );
  } else if (ch) {
    lines.push("Changed nodes: none");
  }
  return lines.join("\n");
}
