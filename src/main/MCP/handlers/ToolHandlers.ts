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
import { MCP_HOST, MCP_PORT } from "../config";
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
} from "../scripts";
import type { AssetEntry, CodeConnectEntry, FigmaViewProvider, Logger } from "../types";
import { parseMermaid } from "../utils/mermaid";
import { normalizeNodeId } from "../utils/nodeId";
import { toolError, toolResult } from "../utils/toolResponse";

/** Shared state the tool handlers operate on, injected by McpServer. */
export interface ToolContext {
  /** Active Figma view (guaranteed non-null: McpServer guards before dispatch). */
  viewProvider: FigmaViewProvider;
  log: Logger;
  codeConnectMap: Map<string, CodeConnectEntry>;
  assetStore: Map<string, AssetEntry>;
}

export class ToolHandlers {
  constructor(private ctx: ToolContext) {}

  /** Run a script in the active Figma tab. Single chokepoint for view access. */
  private exec(script: string): Promise<any> {
    return this.ctx.viewProvider.executeInBrowserView(script);
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

    const json = JSON.stringify(result, null, 2);
    const approxTokens = Math.round(json.length / 4);
    const WARNING_TOKENS = 8_000;

    if (approxTokens > WARNING_TOKENS) {
      const warn =
        `⚠ Large response (~${(approxTokens / 1000).toFixed(1)}k tokens). ` +
        `This may fill context quickly. Consider re-calling with a more specific nodeId or a smaller depth.\n\n`;
      return toolResult(warn + json);
    }

    return toolResult(json);
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

    return toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: get_screenshot ─────────────────────────────────────────────────

  public async toolGetScreenshot(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const scale = typeof args.scale === "number" ? Math.min(4, Math.max(0.5, args.scale)) : 2;
    const savePath = args.savePath ? String(args.savePath) : null;

    // Try Plugin API exportAsync first
    const script = SCREENSHOT_SCRIPT(nodeId, scale);
    const result = await this.exec(script);

    if (result?.error) {
      // Fallback: capture the visible page via capturePage
      this.ctx.log.warn("Plugin API export failed, falling back to capturePage:", result.error);
      return this.capturePageFallback(savePath);
    }

    if (result?.base64) {
      return this.buildScreenshotResponse(result.base64, result.nodeId, result.nodeName, savePath);
    }

    return toolError("Screenshot export returned no data");
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
    const view = this.ctx.viewProvider.getActiveTabView();
    if (!view) return toolError("No active Figma view");

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

  public async toolGetVariableDefs(args: Record<string, unknown>) {
    const nodeId = normalizeNodeId(args.nodeId);
    const script = VARIABLE_DEFS_SCRIPT(nodeId);
    const result = await this.exec(script);

    if (result?.error) {
      return toolError(result.error);
    }

    return toolResult(JSON.stringify(result, null, 2));
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
          const ssScript = SCREENSHOT_SCRIPT(nid, 1);
          const ssResult = await this.exec(ssScript);
          if (ssResult?.base64) {
            const buffer = Buffer.from(ssResult.base64, "base64");
            const assetId = `${crypto.randomUUID()}.png`;
            this.ctx.assetStore.set(assetId, { data: buffer, contentType: "image/png" });
            setTimeout(() => this.ctx.assetStore.delete(assetId), 10 * 60 * 1000);
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
    const query = (args.query as string) || "";
    if (!query) return toolError("query is required");

    const result = await this.exec(SEARCH_DESIGN_SYSTEM_SCRIPT(query));
    if (result?.error) return toolError(result.error);
    return toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: use_figma (write) ─────────────────────────────────────────────

  public async toolUseFigma(args: Record<string, unknown>) {
    const action = args.action as string;
    const params = args.params as Record<string, unknown>;
    if (!action) return toolError("action is required");
    if (!params) return toolError("params is required");

    const paramsJson = JSON.stringify(params);
    const result = await this.exec(USE_FIGMA_SCRIPT(action, paramsJson));
    if (result?.error) return toolError(result.error);
    return toolResult(JSON.stringify(result, null, 2));
  }

  // ── Tool: create_new_file (create page, write) ──────────────────────────

  public async toolCreateNewFile(args: Record<string, unknown>) {
    const name = (args.name as string) || "Untitled Page";
    const result = await this.exec(CREATE_PAGE_SCRIPT(name));
    if (result?.error) return toolError(result.error);
    return toolResult(JSON.stringify(result, null, 2));
  }
}
