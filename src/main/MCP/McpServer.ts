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

import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { WebContentsView } from "electron";
import { version as APP_VERSION } from "../../../package.json";

// ── Configuration ──────────────────────────────────────────────────────────────

const MCP_PORT = 3845;
const MCP_HOST = "127.0.0.1";
const SERVER_NAME = "figma-linux-next";
const SERVER_VERSION = APP_VERSION;
const PROTOCOL_VERSION = "2025-03-26";

// ── Types ──────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpSession {
  id: string;
  createdAt: number;
  lastActivity: number;
  sseResponse: http.ServerResponse | null;
  clientInfo?: { name: string; version: string };
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface AssetEntry {
  data: Buffer;
  contentType: string;
}

interface CodeConnectEntry {
  nodeId: string;
  codeConnectSrc: string;
  codeConnectName: string;
}

/** Minimal interface for querying the Figma BrowserView.
 *  Matches figma-linux-next Window class public surface. */
export interface FigmaViewProvider {
  /** Execute arbitrary JS in the active Figma tab's webContents. */
  executeInBrowserView(script: string): Promise<any>;
  /** Get the active tab's WebContentsView (for capturePage). */
  getActiveTabView(): WebContentsView | null;
  /** Get the URL of the currently focused tab. */
  getActiveTabUrl(): string | null;
}

// ── Logger (accepts figma-linux-next logger interface) ─────────────────────────

interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

const defaultLogger: Logger = {
  info: (...args) => console.log("[MCP]", ...args),
  warn: (...args) => console.warn("[MCP]", ...args),
  error: (...args) => console.error("[MCP]", ...args),
  debug: (...args) => console.debug("[MCP]", ...args),
};

// ── Tool Definitions ───────────────────────────────────────────────────────────
// Tool names follow public Figma MCP documentation for compatibility with Claude/Cursor.

const TOOLS: ToolDefinition[] = [
  {
    name: "get_design_context",
    description:
      "Get the design context for a layer or your selection in Figma. Returns the full " +
      "scene-graph subtree as JSON including node tree structure, layout properties, " +
      "typography, fills, strokes, effects, auto-layout, and component metadata. " +
      "Supports Figma Design and Figma Make files. When nodeId is omitted, uses the currently selected nodes. " +
      "⚠ WARNING: responses can be very large (10k–100k+ tokens) depending on node complexity and depth. " +
      "Always use get_metadata first to identify a specific nodeId, then call with depth ≤ 3. " +
      "Avoid calling on page-level or large container nodes without a targeted nodeId.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID in '1:2' format. Omit to use current selection.",
        },
        depth: {
          type: "number",
          description: "Maximum depth to traverse (default: 10).",
        },
      },
    },
  },
  {
    name: "get_metadata",
    description:
      "Returns a sparse XML scene-graph outline of a node or the current page — layer IDs, " +
      "types, names, positions, and sizes only. No fills, strokes, or styling. Use this to " +
      "navigate large designs and discover node IDs before calling get_design_context on " +
      "specific nodes. When nodeId is omitted, uses the current selection or the full page. " +
      "Supports Figma Design files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID in '1:2' format. Omit to use current selection or full page.",
        },
        depth: {
          type: "number",
          description: "Maximum depth to traverse (default: 8).",
        },
      },
    },
  },
  {
    name: "get_file_info",
    description:
      "Returns JSON metadata about the current Figma file: file name, current page name, " +
      "page list, selection count and selected node IDs/names, and page-level statistics " +
      "(frame count, text nodes, components, instances). Does not traverse the scene graph.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_screenshot",
    description:
      "Capture a screenshot of the currently selected node or the visible canvas. " +
      "Returns a local URL (http://127.0.0.1:3845/assets/<id>.png) that can be fetched " +
      "to get the PNG image data. Helps preserve layout fidelity in generated code. " +
      "Recommended to keep on — only skip if concerned about token limits. " +
      "Supports Figma Design and FigJam files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID in '1:2' format. Omit to capture current selection.",
        },
        scale: {
          type: "number",
          description: "Export scale (default: 2, range: 0.5–4).",
        },
        savePath: {
          type: "string",
          description: "Optional path to save the PNG on disk (absolute or relative to cwd). E.g. 'assets/frame.png' or '/tmp/design.png'. If omitted, image is returned inline only.",
        },
      },
    },
  },
  {
    name: "get_variable_defs",
    description:
      "Returns the variables and styles used in your Figma selection or the entire file. " +
      "When a node is selected or nodeId is provided, returns only variables/styles bound " +
      "to those nodes. When nothing is selected and no nodeId is given, returns ALL local " +
      "variable collections and ALL local styles from the file. For each variable: name, " +
      "resolved type, collection name, and values by mode (e.g. Light/Dark). For each " +
      "style: name, type (PAINT/TEXT/EFFECT/GRID), and description. " +
      "Supports Figma Design files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID in '1:2' format. Omit to use current selection or get all file variables.",
        },
      },
    },
  },
  {
    name: "get_code_connect_map",
    description:
      "Retrieves the mapping between Figma node IDs and their corresponding code " +
      "components in your codebase. Each entry contains codeConnectSrc (file path or URL) " +
      "and codeConnectName (component name). This mapping connects Figma design elements " +
      "directly to their React, Vue, SwiftUI, or other framework implementations, enabling " +
      "seamless design-to-code workflows. Supports Figma Design files.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "add_code_connect_map",
    description:
      "Adds a mapping between a Figma node ID and its corresponding code component " +
      "in your codebase. Setting up these mappings improves the output quality of " +
      "design-to-code workflows by ensuring the correct components are used for each " +
      "part of the design. Mappings persist for the current session. " +
      "Supports Figma Design files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Figma node ID in '1:2' format.",
        },
        codeConnectSrc: {
          type: "string",
          description: "File path or URL of the code component (e.g., 'src/components/Button.tsx').",
        },
        codeConnectName: {
          type: "string",
          description: "Name of the component in your codebase (e.g., 'Button').",
        },
      },
      required: ["nodeId", "codeConnectSrc", "codeConnectName"],
    },
  },
  {
    name: "create_design_system_rules",
    description:
      "Creates a rules file that provides agents with the right context to translate " +
      "Figma designs into high-quality, codebase-aware frontend code. Collects all design " +
      "tokens (variable collections with values by mode), local styles, and component " +
      "definitions from the current file. It helps ensure alignment with your design " +
      "system and tech stack. Save the result to your project's rules/ or .cursor/rules/ " +
      "directory so your agent can access it during code generation. " +
      "No file context required.",
    inputSchema: {
      type: "object",
      properties: {
        techStack: {
          type: "string",
          description: "Tech stack description (e.g., 'React + Tailwind CSS', 'Svelte + vanilla CSS').",
        },
        componentLibraryPath: {
          type: "string",
          description: "Path to your component library (e.g., 'src/components/ui').",
        },
      },
    },
  },
  {
    name: "get_figjam",
    description:
      "Converts FigJam diagrams (such as app architecture workflows) to XML format. " +
      "Returns metadata for FigJam nodes including layer IDs, names, types, positions, " +
      "sizes, text content of stickies and shapes, connector start/end node relationships, " +
      "and screenshots of top-level nodes. Similar to get_metadata but specifically for " +
      "FigJam files with FigJam-specific properties. Supports FigJam files only.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID in '1:2' format. Omit to use current selection or entire page.",
        },
      },
    },
  },
  {
    name: "generate_diagram",
    description:
      "Generates a FigJam diagram from Mermaid syntax. Accepts Mermaid diagram definitions " +
      "and converts them into interactive FigJam shapes and connectors that can be edited " +
      "and shared. Supported diagram types: Flowchart, Gantt chart, State diagram, " +
      "Sequence diagram. You do not have to provide Mermaid syntax yourself — describe " +
      "the desired diagram in natural language and the agent will generate the appropriate " +
      "Mermaid syntax. Requires an open FigJam file. No file context required to start.",
    inputSchema: {
      type: "object",
      properties: {
        mermaid: {
          type: "string",
          description: "Mermaid diagram syntax (e.g., 'graph TD; A[Start]-->B{Decision}; B-->|Yes|C[End];').",
        },
      },
      required: ["mermaid"],
    },
  },
  {
    name: "search_design_system",
    description:
      "Searches local variables, styles, and components in the current Figma file " +
      "by text query. Returns matching variables (with values by mode), styles " +
      "(paint/text/effect/grid), and components. Use this to find existing design " +
      "system elements before creating new ones. Results capped at 50 per category. " +
      "Supports Figma Design files.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text to search for in variable, style, and component names.",
        },
      },
      required: ["query"],
    },
  },
];

// ── Figma Plugin API Queries ───────────────────────────────────────────────────
// These JS snippets run inside the Figma webapp's renderer context via
// webContents.executeJavaScript(). They use the internal Figma scene graph
// that's available in the global scope.

const DESIGN_CONTEXT_SCRIPT = (nodeId: string | null, depth: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return JSON.stringify({ error: "Figma Plugin API not available — ensure a file is open and fully loaded" });

    function serializeNode(node, currentDepth, maxDepth) {
      if (!node || currentDepth > maxDepth) return null;
      const result = {
        id: node.id,
        name: node.name,
        type: node.type,
        visible: node.visible,
      };

      // Layout
      if ('x' in node) result.x = node.x;
      if ('y' in node) result.y = node.y;
      if ('width' in node) result.width = node.width;
      if ('height' in node) result.height = node.height;
      if ('rotation' in node) result.rotation = node.rotation;
      if ('opacity' in node) result.opacity = node.opacity;

      // Auto-layout
      if ('layoutMode' in node && node.layoutMode !== 'NONE') {
        result.layoutMode = node.layoutMode;
        result.primaryAxisSizingMode = node.primaryAxisSizingMode;
        result.counterAxisSizingMode = node.counterAxisSizingMode;
        result.primaryAxisAlignItems = node.primaryAxisAlignItems;
        result.counterAxisAlignItems = node.counterAxisAlignItems;
        result.paddingLeft = node.paddingLeft;
        result.paddingRight = node.paddingRight;
        result.paddingTop = node.paddingTop;
        result.paddingBottom = node.paddingBottom;
        result.itemSpacing = node.itemSpacing;
      }

      // Sizing constraints
      if ('constraints' in node) result.constraints = node.constraints;
      if ('layoutSizingHorizontal' in node) result.layoutSizingHorizontal = node.layoutSizingHorizontal;
      if ('layoutSizingVertical' in node) result.layoutSizingVertical = node.layoutSizingVertical;

      // Fills, strokes, effects
      if ('fills' in node) {
        try { result.fills = JSON.parse(JSON.stringify(node.fills)); } catch(e) {}
      }
      if ('strokes' in node) {
        try { result.strokes = JSON.parse(JSON.stringify(node.strokes)); } catch(e) {}
      }
      if ('effects' in node) {
        try { result.effects = JSON.parse(JSON.stringify(node.effects)); } catch(e) {}
      }
      if ('strokeWeight' in node) result.strokeWeight = node.strokeWeight;
      if ('cornerRadius' in node) result.cornerRadius = node.cornerRadius;

      // Typography
      if (node.type === 'TEXT') {
        result.characters = node.characters;
        if ('fontSize' in node) result.fontSize = node.fontSize;
        if ('fontName' in node) {
          try { result.fontName = JSON.parse(JSON.stringify(node.fontName)); } catch(e) {}
        }
        if ('textAlignHorizontal' in node) result.textAlignHorizontal = node.textAlignHorizontal;
        if ('textAlignVertical' in node) result.textAlignVertical = node.textAlignVertical;
        if ('lineHeight' in node) {
          try { result.lineHeight = JSON.parse(JSON.stringify(node.lineHeight)); } catch(e) {}
        }
        if ('letterSpacing' in node) {
          try { result.letterSpacing = JSON.parse(JSON.stringify(node.letterSpacing)); } catch(e) {}
        }
      }

      // Component info
      if ('componentProperties' in node) {
        try { result.componentProperties = JSON.parse(JSON.stringify(node.componentProperties)); } catch(e) {}
      }
      if (node.type === 'INSTANCE' && node.mainComponent) {
        result.mainComponentId = node.mainComponent.id;
        result.mainComponentName = node.mainComponent.name;
      }
      if (node.type === 'COMPONENT') {
        result.isComponent = true;
      }

      // Children
      if ('children' in node && currentDepth < maxDepth) {
        result.children = node.children.map(c => serializeNode(c, currentDepth + 1, maxDepth)).filter(Boolean);
      }

      return result;
    }

    let targetNodes;
    ${nodeId ? `
      const target = figma.getNodeById("${nodeId}");
      if (!target) return JSON.stringify({ error: "Node not found: ${nodeId}" });
      targetNodes = [target];
    ` : `
      targetNodes = figma.currentPage.selection;
      if (!targetNodes || targetNodes.length === 0) {
        return JSON.stringify({ error: "No nodes selected. Select a node in Figma or provide a nodeId." });
      }
    `}

    const result = {
      fileName: figma.root.name,
      currentPage: figma.currentPage.name,
      selectionCount: targetNodes.length,
      nodes: targetNodes.map(n => serializeNode(n, 0, ${depth})),
    };

    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
`;

const FILE_INFO_SCRIPT = `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available — ensure a file is open and fully loaded" };

    const pages = figma.root.children;
    const currentPage = figma.currentPage;
    const selection = currentPage.selection;

    let componentCount = 0;
    let instanceCount = 0;
    let textCount = 0;
    let frameCount = 0;

    function countNodes(node) {
      if (node.type === 'COMPONENT') componentCount++;
      if (node.type === 'INSTANCE') instanceCount++;
      if (node.type === 'TEXT') textCount++;
      if (node.type === 'FRAME') frameCount++;
      if ('children' in node) node.children.forEach(countNodes);
    }
    currentPage.children.forEach(countNodes);

    return {
      fileName: figma.root.name,
      currentPage: currentPage.name,
      pageCount: pages.length,
      pageNames: pages.map(p => p.name),
      selectionCount: selection.length,
      selectedNodeIds: selection.map(n => n.id),
      selectedNodeNames: selection.map(n => n.name),
      currentPageStats: {
        components: componentCount,
        instances: instanceCount,
        textNodes: textCount,
        frames: frameCount,
      },
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const METADATA_XML_SCRIPT = (nodeId: string | null, depth: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return JSON.stringify({ error: "Figma Plugin API not available — ensure a file is open and fully loaded" });

    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function nodeToXml(node, indent, currentDepth) {
      if (!node || currentDepth > ${depth}) return '';
      try {
        const pad = '  '.repeat(indent);
        const tag = (node.type || 'node').toLowerCase().replace(/_/g, '-');
        const attrs = [];
        try { attrs.push('id="' + esc(node.id) + '"'); } catch(_) {}
        try { attrs.push('name="' + esc(node.name) + '"'); } catch(_) {}
        try { if ('x' in node) attrs.push('x="' + Math.round(node.x) + '"'); } catch(_) {}
        try { if ('y' in node) attrs.push('y="' + Math.round(node.y) + '"'); } catch(_) {}
        try { if ('width' in node) attrs.push('width="' + Math.round(node.width) + '"'); } catch(_) {}
        try { if ('height' in node) attrs.push('height="' + Math.round(node.height) + '"'); } catch(_) {}
        try {
          if (node.type === 'TEXT' && 'characters' in node) {
            attrs.push('text="' + esc(String(node.characters).substring(0, 80)) + '"');
          }
        } catch(_) {}

        if ('children' in node && node.children && node.children.length > 0 && currentDepth < ${depth}) {
          let xml = pad + '<' + tag + ' ' + attrs.join(' ') + '>\\n';
          for (let i = 0; i < node.children.length; i++) {
            try { xml += nodeToXml(node.children[i], indent + 1, currentDepth + 1); } catch(_) {}
          }
          xml += pad + '</' + tag + '>\\n';
          return xml;
        } else {
          return pad + '<' + tag + ' ' + attrs.join(' ') + '/>\\n';
        }
      } catch(e) { return ''; }
    }

    let targetNodes;
    ${nodeId ? `
      const target = figma.getNodeById("${nodeId}");
      if (!target) return JSON.stringify({ error: "Node not found: ${nodeId}" });
      targetNodes = [target];
    ` : `
      const sel = figma.currentPage.selection;
      targetNodes = (sel && sel.length > 0) ? sel : figma.currentPage.children;
    `}

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\\n';
    xml += '<canvas name="' + esc(figma.currentPage.name) + '" file="' + esc(figma.root.name) + '">\\n';
    for (let i = 0; i < targetNodes.length; i++) {
      try { xml += nodeToXml(targetNodes[i], 1, 0); } catch(_) {}
    }
    xml += '</canvas>\\n';

    return JSON.stringify({ xml });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
`;

const VARIABLE_DEFS_SCRIPT = (nodeId: string | null) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available — ensure a file is open and fully loaded" };

    let targetNodes = null;
    let fileWideMode = false;
    ${nodeId ? `
      const target = figma.getNodeById("${nodeId}");
      if (!target) return { error: "Node not found: ${nodeId}" };
      targetNodes = [target];
    ` : `
      const sel = figma.currentPage.selection;
      if (sel && sel.length > 0) {
        targetNodes = sel;
      } else {
        fileWideMode = true;
      }
    `}

    const variables = {};
    const styles = {};

    if (fileWideMode) {
      // Collect ALL local variable collections from the file
      try {
        const collections = figma.variables.getLocalVariableCollections();
        for (const coll of collections) {
          for (const varId of coll.variableIds) {
            try {
              const v = figma.variables.getVariableById(varId);
              if (v && !variables[v.id]) {
                const values = {};
                for (const mode of coll.modes) {
                  try { values[mode.name] = JSON.parse(JSON.stringify(v.valuesByMode[mode.modeId])); } catch(e) {}
                }
                variables[v.id] = {
                  name: v.name,
                  type: v.resolvedType,
                  collection: coll.name,
                  valuesByMode: values,
                };
              }
            } catch(e) {}
          }
        }
      } catch(e) {}

      // Collect ALL local styles from the file
      const styleFns = [
        ['PAINT', 'getLocalPaintStyles'],
        ['TEXT', 'getLocalTextStyles'],
        ['EFFECT', 'getLocalEffectStyles'],
        ['GRID', 'getLocalGridStyles'],
      ];
      for (const [type, fn] of styleFns) {
        try {
          const localStyles = figma[fn]();
          for (const s of localStyles) {
            if (!styles[s.id]) {
              styles[s.id] = {
                name: s.name,
                type: type,
                description: s.description || null,
              };
            }
          }
        } catch(e) {}
      }

      return {
        variables: Object.values(variables),
        styles: Object.values(styles),
        source: 'file',
      };
    }

    // Selection-based collection
    function collectVariables(node) {
      if ('boundVariables' in node && node.boundVariables) {
        for (const [prop, binding] of Object.entries(node.boundVariables)) {
          try {
            const bindings = Array.isArray(binding) ? binding : [binding];
            for (const b of bindings) {
              if (b && b.id) {
                const v = figma.variables.getVariableById(b.id);
                if (v && !variables[v.id]) {
                  const collection = figma.variables.getVariableCollectionById(v.variableCollectionId);
                  variables[v.id] = {
                    name: v.name,
                    type: v.resolvedType,
                    collection: collection ? collection.name : null,
                    valuesByMode: {},
                  };
                  if (collection) {
                    for (const mode of collection.modes) {
                      try {
                        const val = v.valuesByMode[mode.modeId];
                        variables[v.id].valuesByMode[mode.name] = JSON.parse(JSON.stringify(val));
                      } catch(e) {}
                    }
                  }
                }
              }
            }
          } catch(e) {}
        }
      }

      const styleProps = ['fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId', 'gridStyleId'];
      for (const prop of styleProps) {
        if (prop in node && node[prop] && typeof node[prop] === 'string') {
          try {
            const style = figma.getStyleById(node[prop]);
            if (style && !styles[style.id]) {
              styles[style.id] = {
                name: style.name,
                type: style.type,
                description: style.description || null,
              };
            }
          } catch(e) {}
        }
      }

      if ('children' in node) {
        node.children.forEach(collectVariables);
      }
    }

    targetNodes.forEach(collectVariables);

    return {
      variables: Object.values(variables),
      styles: Object.values(styles),
      source: 'selection',
      nodeCount: targetNodes.length,
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const FIGJAM_SCRIPT = (nodeId: string | null) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };

    function nodeToXml(node, indent) {
      try {
        if (!node) return '';
        const pad = '  '.repeat(indent);
        const attrs = [];
        try { attrs.push('id="' + node.id + '"'); } catch(_) {}
        try { attrs.push('name="' + (node.name || '').replace(/"/g, '&quot;') + '"'); } catch(_) {}
        try { attrs.push('type="' + node.type + '"'); } catch(_) {}
        try { if ('x' in node) attrs.push('x="' + Math.round(node.x) + '"'); } catch(_) {}
        try { if ('y' in node) attrs.push('y="' + Math.round(node.y) + '"'); } catch(_) {}
        try { if ('width' in node) attrs.push('width="' + Math.round(node.width) + '"'); } catch(_) {}
        try { if ('height' in node) attrs.push('height="' + Math.round(node.height) + '"'); } catch(_) {}
        try {
          if (node.type === 'STICKY' || node.type === 'SHAPE_WITH_TEXT') {
            var text = ('characters' in node) ? node.characters : (node.text ? node.text.characters : null);
            if (text) attrs.push('text="' + String(text).replace(/"/g, '&quot;') + '"');
          }
        } catch(_) {}
        try {
          if (node.type === 'CONNECTOR') {
            try { if (node.connectorStart && node.connectorStart.endpointNodeId) attrs.push('startNodeId="' + node.connectorStart.endpointNodeId + '"'); } catch(_) {}
            try { if (node.connectorEnd && node.connectorEnd.endpointNodeId) attrs.push('endNodeId="' + node.connectorEnd.endpointNodeId + '"'); } catch(_) {}
            try { if (node.text && node.text.characters) attrs.push('label="' + node.text.characters.replace(/"/g, '&quot;') + '"'); } catch(_) {}
          }
        } catch(_) {}
        var nodeType = node.type || 'NODE';
        if ('children' in node && node.children && node.children.length > 0) {
          var xml = pad + '<' + nodeType + ' ' + attrs.join(' ') + '>\\n';
          for (var ci = 0; ci < node.children.length; ci++) {
            try { xml += nodeToXml(node.children[ci], indent + 1); } catch(_) {}
          }
          xml += pad + '</' + nodeType + '>\\n';
          return xml;
        } else {
          return pad + '<' + nodeType + ' ' + attrs.join(' ') + '/>\\n';
        }
      } catch(e) {
        return '';
      }
    }

    var targetNodes;
    ${nodeId ? `
      var target = figma.getNodeById("${nodeId}");
      if (!target) return { error: "Node not found: ${nodeId}" };
      targetNodes = [target];
    ` : `
      var sel = figma.currentPage.selection;
      targetNodes = (sel && sel.length > 0) ? sel : figma.currentPage.children;
    `}

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\\n<figjam fileName="' + figma.root.name + '" page="' + figma.currentPage.name + '">\\n';
    for (var i = 0; i < targetNodes.length; i++) {
      xml += nodeToXml(targetNodes[i], 1);
    }
    xml += '</figjam>\\n';

    var nodeIds = [];
    function collectIds(n) {
      if (n.type !== 'DOCUMENT' && n.type !== 'CANVAS') nodeIds.push(n.id);
      if ('children' in n && nodeIds.length < 20) { for (var k = 0; k < n.children.length; k++) { try { collectIds(n.children[k]); } catch(_) {} } }
    }
    for (var j = 0; j < targetNodes.length; j++) { try { collectIds(targetNodes[j]); } catch(_) {} }

    return { xml: xml, nodeIds: nodeIds.slice(0, 20), nodeCount: targetNodes.length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const GENERATE_DIAGRAM_SCRIPT = (nodesJson: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    if (typeof figma.createShapeWithText !== 'function') {
      return { error: "This command requires a FigJam file. Open or create a FigJam file first." };
    }
    const nodes = ${nodesJson};
    const createdNodes = {};
    const SPACING_X = 250;
    const SPACING_Y = 120;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const shape = figma.createShapeWithText();
      shape.shapeType = n.shape || 'ROUNDED_RECTANGLE';
      shape.x = (i % cols) * SPACING_X + 100;
      shape.y = Math.floor(i / cols) * SPACING_Y + 100;
      shape.resize(200, 60);
      try {
        if (shape.text) {
          figma.loadFontAsync(shape.text.fontName || { family: 'Inter', style: 'Medium' }).then(() => {
            shape.text.characters = n.label || n.id;
          }).catch(() => {});
        }
      } catch(_) {}
      createdNodes[n.id] = shape.id;
      figma.currentPage.appendChild(shape);
    }
    const edgeList = nodes.filter(n => n._edges).flatMap(n => n._edges);
    const connectors = [];
    for (const edge of edgeList) {
      if (createdNodes[edge.from] && createdNodes[edge.to]) {
        try {
          const connector = figma.createConnector();
          connector.connectorStart = { endpointNodeId: createdNodes[edge.from], magnet: 'AUTO' };
          connector.connectorEnd = { endpointNodeId: createdNodes[edge.to], magnet: 'AUTO' };
          if (edge.label && connector.text) {
            figma.loadFontAsync(connector.text.fontName || { family: 'Inter', style: 'Medium' }).then(() => {
              connector.text.characters = edge.label;
            }).catch(() => {});
          }
          connectors.push(connector.id);
        } catch(e) {}
      }
    }
    const allCreated = Object.values(createdNodes).map(id => figma.getNodeById(id)).filter(Boolean);
    if (allCreated.length > 0) {
      figma.currentPage.selection = allCreated;
      figma.viewport.scrollAndZoomIntoView(allCreated);
    }
    return { success: true, nodesCreated: Object.keys(createdNodes).length, connectorsCreated: connectors.length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const DESIGN_SYSTEM_RULES_SCRIPT = `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };

    // Collect all local variable collections and their variables
    const collections = [];
    try {
      const localCollections = figma.variables.getLocalVariableCollections();
      for (const coll of localCollections) {
        const vars = [];
        for (const varId of coll.variableIds) {
          const v = figma.variables.getVariableById(varId);
          if (v) {
            const values = {};
            for (const mode of coll.modes) {
              try { values[mode.name] = JSON.parse(JSON.stringify(v.valuesByMode[mode.modeId])); } catch(e) {}
            }
            vars.push({ name: v.name, type: v.resolvedType, values });
          }
        }
        collections.push({ name: coll.name, modes: coll.modes.map(m => m.name), variables: vars });
      }
    } catch(e) {}

    // Collect local styles with full values
    const allStyles = [];
    try {
      const paintStyles = figma.getLocalPaintStyles ? figma.getLocalPaintStyles() : [];
      for (const s of paintStyles) {
        const entry = { name: s.name, type: 'PAINT', description: s.description || null };
        try { entry.paints = JSON.parse(JSON.stringify(s.paints)); } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const textStyles = figma.getLocalTextStyles ? figma.getLocalTextStyles() : [];
      for (const s of textStyles) {
        const entry = { name: s.name, type: 'TEXT', description: s.description || null };
        try { entry.fontSize = s.fontSize; } catch(e) {}
        try { entry.fontName = JSON.parse(JSON.stringify(s.fontName)); } catch(e) {}
        try { entry.lineHeight = JSON.parse(JSON.stringify(s.lineHeight)); } catch(e) {}
        try { entry.letterSpacing = JSON.parse(JSON.stringify(s.letterSpacing)); } catch(e) {}
        try { entry.textDecoration = s.textDecoration; } catch(e) {}
        try { entry.textCase = s.textCase; } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const effectStyles = figma.getLocalEffectStyles ? figma.getLocalEffectStyles() : [];
      for (const s of effectStyles) {
        const entry = { name: s.name, type: 'EFFECT', description: s.description || null };
        try { entry.effects = JSON.parse(JSON.stringify(s.effects)); } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const gridStyles = figma.getLocalGridStyles ? figma.getLocalGridStyles() : [];
      for (const s of gridStyles) {
        const entry = { name: s.name, type: 'GRID', description: s.description || null };
        try { entry.layoutGrids = JSON.parse(JSON.stringify(s.layoutGrids)); } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}

    // Collect component sets (variants)
    const components = [];
    function findComponents(node) {
      if (node.type === 'COMPONENT_SET') {
        const props = {};
        try { Object.assign(props, JSON.parse(JSON.stringify(node.componentPropertyDefinitions))); } catch(e) {}
        components.push({ name: node.name, type: 'COMPONENT_SET', properties: props });
      } else if (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET')) {
        components.push({ name: node.name, type: 'COMPONENT' });
      }
      if ('children' in node) node.children.forEach(findComponents);
    }
    figma.currentPage.children.forEach(findComponents);

    return {
      fileName: figma.root.name,
      collections,
      styles: allStyles,
      components: components.slice(0, 100), // limit
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const SCREENSHOT_SCRIPT = (nodeId: string | null, scale: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available — ensure a file is open and fully loaded" };

    let target;
    ${nodeId ? `
      target = figma.getNodeById("${nodeId}");
      if (!target) return { error: "Node not found: ${nodeId}" };
    ` : `
      const sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) return { error: "No node selected" };
      target = sel[0];
    `}

    // exportAsync returns a Uint8Array in Plugin API
    return target.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: ${scale} }
    }).then(bytes => {
      // Convert to base64 for transport over IPC
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { base64: btoa(binary), nodeId: target.id, nodeName: target.name };
    });
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const SEARCH_DESIGN_SYSTEM_SCRIPT = (query: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    const q = "${query}".toLowerCase();
    const results = { variables: [], styles: [], components: [] };

    // Search local variables
    try {
      const collections = figma.variables.getLocalVariableCollections();
      for (const coll of collections) {
        for (const varId of coll.variableIds) {
          try {
            const v = figma.variables.getVariableById(varId);
            if (v && v.name.toLowerCase().includes(q)) {
              const values = {};
              for (const mode of coll.modes) {
                try { values[mode.name] = JSON.parse(JSON.stringify(v.valuesByMode[mode.modeId])); } catch(e) {}
              }
              results.variables.push({ name: v.name, type: v.resolvedType, collection: coll.name, valuesByMode: values });
            }
          } catch(e) {}
        }
      }
    } catch(e) {}

    // Search local styles
    const styleFns = [
      ['PAINT', 'getLocalPaintStyles'],
      ['TEXT', 'getLocalTextStyles'],
      ['EFFECT', 'getLocalEffectStyles'],
      ['GRID', 'getLocalGridStyles'],
    ];
    for (const [type, fn] of styleFns) {
      try {
        const localStyles = figma[fn]();
        for (const s of localStyles) {
          if (s.name.toLowerCase().includes(q)) {
            results.styles.push({ name: s.name, type: type, description: s.description || null });
          }
        }
      } catch(e) {}
    }

    // Search components on current page
    function findComponents(node) {
      if (node.type === 'COMPONENT_SET' && node.name.toLowerCase().includes(q)) {
        results.components.push({ name: node.name, id: node.id, type: 'COMPONENT_SET' });
      } else if (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET') && node.name.toLowerCase().includes(q)) {
        results.components.push({ name: node.name, id: node.id, type: 'COMPONENT' });
      }
      if ('children' in node && results.components.length < 50) node.children.forEach(findComponents);
    }
    figma.currentPage.children.forEach(findComponents);

    results.variables = results.variables.slice(0, 50);
    results.styles = results.styles.slice(0, 50);
    results.components = results.components.slice(0, 50);

    return results;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const USE_FIGMA_SCRIPT = (action: string, params: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    const params = ${params};
    const action = "${action}";

    switch (action) {
      case 'create_frame': {
        const frame = figma.createFrame();
        frame.name = params.name || 'New Frame';
        if (params.x !== undefined) frame.x = params.x;
        if (params.y !== undefined) frame.y = params.y;
        if (params.cornerRadius !== undefined) frame.cornerRadius = params.cornerRadius;
        // Resize BEFORE setting sizing modes — frame.resize() in Figma resets both sizing modes
        // to FIXED, so it must run first; AUTO/FIXED assignments below then override correctly.
        if (params.width && params.height) frame.resize(params.width, params.height);
        // Auto-layout (sizing mode assignments come AFTER resize so they are not clobbered)
        if (params.layoutMode) { try { frame.layoutMode = params.layoutMode; } catch(e) {} }
        if (params.layoutMode && params.layoutMode !== 'NONE') {
          if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop;
          if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom;
          if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft;
          if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight;
          if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing;
          if (params.primaryAxisAlignItems) { try { frame.primaryAxisAlignItems = params.primaryAxisAlignItems; } catch(e) {} }
          if (params.counterAxisAlignItems) { try { frame.counterAxisAlignItems = params.counterAxisAlignItems; } catch(e) {} }
          if (params.primaryAxisSizingMode) { try { frame.primaryAxisSizingMode = params.primaryAxisSizingMode; } catch(e) {} }
          if (params.counterAxisSizingMode) { try { frame.counterAxisSizingMode = params.counterAxisSizingMode; } catch(e) {} }
        }
        if (params.parentNodeId) {
          const parent = figma.getNodeById(params.parentNodeId);
          if (parent && 'appendChild' in parent) parent.appendChild(frame);
        }
        // Apply fills/strokes after reparenting — appendChild resets fills to frame default
        if (params.fills) { try { frame.fills = params.fills; } catch(e) {} }
        if (params.strokes) { try { frame.strokes = params.strokes; } catch(e) {} }
        if (params.strokeWeight !== undefined) frame.strokeWeight = params.strokeWeight;
        if (params.strokeAlign) { try { frame.strokeAlign = params.strokeAlign; } catch(e) {} }
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
        return { success: true, nodeId: frame.id, name: frame.name, type: 'FRAME' };
      }
      case 'create_text': {
        const text = figma.createText();
        text.name = params.name || 'New Text';
        if (params.x !== undefined) text.x = params.x;
        if (params.y !== undefined) text.y = params.y;
        const family = params.fontFamily || 'Inter';
        const style = params.fontStyle || 'Regular';
        // Always load Regular first — new text nodes start with the default Regular font.
        // Without this, setting characters on a Bold node throws "Inter Regular unloaded".
        const fontLoads = [figma.loadFontAsync({ family, style: 'Regular' })];
        if (style !== 'Regular') fontLoads.push(figma.loadFontAsync({ family, style }));
        return Promise.all(fontLoads).then(() => {
          text.characters = params.characters || 'Text';
          if (params.fontSize) text.fontSize = params.fontSize;
          if (style !== 'Regular') { try { text.fontName = { family, style }; } catch(e) {} }
          if (params.parentNodeId) {
            const parent = figma.getNodeById(params.parentNodeId);
            if (parent && 'appendChild' in parent) parent.appendChild(text);
          }
          // Apply fills after reparenting — appendChild resets fills
          if (params.fills) { try { text.fills = params.fills; } catch(e) {} }
          figma.currentPage.selection = [text];
          return { success: true, nodeId: text.id, name: text.name, type: 'TEXT' };
        });
      }
      case 'create_rectangle': {
        const rect = figma.createRectangle();
        rect.name = params.name || 'New Rectangle';
        rect.resize(params.width || 100, params.height || 100);
        if (params.x !== undefined) rect.x = params.x;
        if (params.y !== undefined) rect.y = params.y;
        if (params.cornerRadius !== undefined) rect.cornerRadius = params.cornerRadius;
        if (params.parentNodeId) {
          const parent = figma.getNodeById(params.parentNodeId);
          if (parent && 'appendChild' in parent) parent.appendChild(rect);
        }
        // Apply fills/strokes after reparenting — appendChild resets fills to frame default
        if (params.fills) { try { rect.fills = params.fills; } catch(e) {} }
        if (params.strokes) { try { rect.strokes = params.strokes; } catch(e) {} }
        if (params.strokeWeight !== undefined) rect.strokeWeight = params.strokeWeight;
        if (params.strokeAlign) { try { rect.strokeAlign = params.strokeAlign; } catch(e) {} }
        figma.currentPage.selection = [rect];
        return { success: true, nodeId: rect.id, name: rect.name, type: 'RECTANGLE' };
      }
      case 'reparent_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        if (!params.parentNodeId) return { error: 'parentNodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        const parent = figma.getNodeById(params.parentNodeId);
        if (!parent) return { error: 'Parent not found: ' + params.parentNodeId };
        if (!('appendChild' in parent)) return { error: 'Parent cannot have children' };
        parent.appendChild(node);
        return { success: true, nodeId: node.id, name: node.name, parentId: parent.id };
      }
      case 'update_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        if (params.name !== undefined) node.name = params.name;
        if (params.visible !== undefined) node.visible = params.visible;
        if (params.opacity !== undefined && 'opacity' in node) node.opacity = params.opacity;
        if (params.x !== undefined && 'x' in node) node.x = params.x;
        if (params.y !== undefined && 'y' in node) node.y = params.y;
        if (params.width !== undefined && params.height !== undefined && 'resize' in node) node.resize(params.width, params.height);
        if (params.fills && 'fills' in node) { try { node.fills = params.fills; } catch(e) {} }
        if (params.strokes && 'strokes' in node) { try { node.strokes = params.strokes; } catch(e) {} }
        if (params.strokeWeight !== undefined && 'strokeWeight' in node) node.strokeWeight = params.strokeWeight;
        if (params.strokeAlign && 'strokeAlign' in node) { try { node.strokeAlign = params.strokeAlign; } catch(e) {} }
        if (params.cornerRadius !== undefined && 'cornerRadius' in node) node.cornerRadius = params.cornerRadius;
        // Auto-layout (frames only)
        if (node.type === 'FRAME') {
          if (params.layoutMode) { try { node.layoutMode = params.layoutMode; } catch(e) {} }
          if (params.paddingTop !== undefined) node.paddingTop = params.paddingTop;
          if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
          if (params.paddingLeft !== undefined) node.paddingLeft = params.paddingLeft;
          if (params.paddingRight !== undefined) node.paddingRight = params.paddingRight;
          if (params.itemSpacing !== undefined) node.itemSpacing = params.itemSpacing;
          if (params.primaryAxisAlignItems) { try { node.primaryAxisAlignItems = params.primaryAxisAlignItems; } catch(e) {} }
          if (params.counterAxisAlignItems) { try { node.counterAxisAlignItems = params.counterAxisAlignItems; } catch(e) {} }
          if (params.primaryAxisSizingMode) { try { node.primaryAxisSizingMode = params.primaryAxisSizingMode; } catch(e) {} }
          if (params.counterAxisSizingMode) { try { node.counterAxisSizingMode = params.counterAxisSizingMode; } catch(e) {} }
        }
        if (params.characters !== undefined && node.type === 'TEXT') {
          return figma.loadFontAsync(node.fontName || { family: 'Inter', style: 'Regular' }).then(() => {
            node.characters = params.characters;
            return { success: true, nodeId: node.id, name: node.name };
          });
        }
        return { success: true, nodeId: node.id, name: node.name };
      }
      case 'delete_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        const name = node.name;
        node.remove();
        return { success: true, deleted: params.nodeId, name: name };
      }
      case 'set_variable': {
        if (!params.name || !params.collectionName) return { error: 'name and collectionName are required' };
        let collection = null;
        try {
          const colls = figma.variables.getLocalVariableCollections();
          collection = colls.find(c => c.name === params.collectionName);
        } catch(e) {}
        if (!collection) {
          collection = figma.variables.createVariableCollection(params.collectionName);
        }
        const resolvedType = params.resolvedType || 'COLOR';
        const variable = figma.variables.createVariable(params.name, collection, resolvedType);
        if (params.value !== undefined) {
          const modeId = collection.modes[0].modeId;
          variable.setValueForMode(modeId, params.value);
        }
        return { success: true, variableId: variable.id, name: variable.name, collection: collection.name };
      }
      default:
        return { error: 'Unknown action: ' + action };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

const CREATE_PAGE_SCRIPT = (pageName: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    const page = figma.createPage();
    page.name = "${pageName}";
    figma.currentPage = page;
    return { success: true, pageId: page.id, pageName: page.name };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

// ── Write Tool Definitions (gated by settings) ──────────────────────────────

const WRITE_TOOLS: ToolDefinition[] = [
  {
    name: "use_figma",
    description:
      "General-purpose tool for creating, editing, or deleting objects in a Figma file. " +
      "Accepts an action and params object. Supported actions: create_frame, create_text, " +
      "create_rectangle, update_node, delete_node, set_variable, reparent_node. " +
      "All create actions accept an optional parentNodeId to place the node inside a frame. " +
      "create_text accepts fills to set text color at creation time. " +
      "Use get_metadata first to discover node IDs before updating or deleting. " +
      "⚠ This is a WRITE tool that modifies the file.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Action to perform: create_frame, create_text, create_rectangle, update_node, delete_node, set_variable, reparent_node.",
          enum: ["create_frame", "create_text", "create_rectangle", "update_node", "delete_node", "set_variable", "reparent_node"],
        },
        params: {
          type: "object",
          description:
            "Parameters for the action. " +
            "For create_frame: name, width, height, x, y, fills, strokes, strokeWeight, strokeAlign, cornerRadius, parentNodeId; " +
            "auto-layout: layoutMode (HORIZONTAL|VERTICAL), paddingTop/Bottom/Left/Right, itemSpacing, primaryAxisAlignItems (MIN|CENTER|MAX|SPACE_BETWEEN), counterAxisAlignItems (MIN|CENTER|MAX), primaryAxisSizingMode (FIXED|AUTO), counterAxisSizingMode (FIXED|AUTO). " +
            "For create_rectangle: name, width, height, x, y, fills, strokes, strokeWeight, strokeAlign, cornerRadius, parentNodeId. " +
            "For create_text: name, characters, fontFamily, fontStyle, fontSize, fills, x, y, parentNodeId. " +
            "For update_node: nodeId (required), plus any: name, x, y, width, height, fills, strokes, strokeWeight, strokeAlign, cornerRadius, characters, opacity, visible, layoutMode, padding*, itemSpacing, primaryAxisAlignItems, counterAxisAlignItems, primaryAxisSizingMode, counterAxisSizingMode. " +
            "For delete_node: nodeId (required). " +
            "For reparent_node: nodeId (required), parentNodeId (required). " +
            "For set_variable: name, collectionName, resolvedType (COLOR/FLOAT/STRING/BOOLEAN), value.",
        },
      },
      required: ["action", "params"],
    },
  },
  {
    name: "create_new_file",
    description:
      "Creates a new page in the current Figma file and navigates to it. " +
      "Note: the Figma Plugin API within the renderer cannot create separate files — " +
      "this tool creates a new page as the closest equivalent. " +
      "⚠ This is a WRITE tool that modifies the file.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the new page.",
        },
      },
      required: ["name"],
    },
  },
];

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
        } catch { /* ignore */ }
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
        this._sessionReaper = setInterval(() => {
          const cutoff = Date.now() - 30 * 60 * 1000;
          for (const [id, session] of this.sessions) {
            if (session.lastActivity < cutoff) {
              if (session.sseResponse) { try { session.sseResponse.end(); } catch { /* ignore */ } }
              this.sessions.delete(id);
              this.log.info("Session reaped (idle 30m):", id);
            }
          }
        }, 5 * 60 * 1000);
        resolve({ didStart: true, port });
      });
    });
  }

  /** Stop the HTTP server and clean up all sessions. */
  public stop(): void {
    // Close all SSE connections
    for (const [id, session] of this.sessions) {
      if (session.sseResponse) {
        try { session.sseResponse.end(); } catch { /* ignore */ }
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

  private async handleMcpEndpoint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
        "Connection": "keep-alive",
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
        if (s.sseResponse) { try { s.sseResponse.end(); } catch { /* ignore */ } }
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

      this.log.info("New session initialized:", newSessionId,
        "client:", (body.params?.clientInfo as any)?.name);

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
      "Connection": "keep-alive",
      ...this.cors(),
    });

    // Send endpoint event per SSE transport spec
    res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      try { res.write(":\n\n"); } catch {
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

  private async handleSseMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
          if (!this._writeToolsEnabled) return this.toolError("Write tools are disabled. Enable them in Settings → General → MCP Server.");
          return await this.toolUseFigma(args);
        case "create_new_file":
          if (!this._writeToolsEnabled) return this.toolError("Write tools are disabled. Enable them in Settings → General → MCP Server.");
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
      return this.toolError("Failed to deserialize design context — the Figma scene graph may contain non-serializable objects");
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
  private buildScreenshotResponse(base64: string, nodeId: string, nodeName: string, savePath: string | null) {
    type ContentItem = { type: string; data?: string; mimeType?: string; text?: string };
    const content: ContentItem[] = [
      { type: "image", data: base64, mimeType: "image/png" },
    ];

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
    return this.buildScreenshotResponse(buffer.toString("base64"), "", "canvas (capturePage fallback)", savePath);
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

    return this.toolResult(JSON.stringify({
      mappings: map,
      count: this.codeConnectMap.size,
    }, null, 2));
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
        } catch { /* skip */ }
      }
    }

    let xml = result.xml ?? '';
    if (Object.keys(screenshots).length > 0) {
      xml += '\n<!-- Node Screenshots -->\n';
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

    const nodesWithEdges = nodes.map(n => ({ ...n, _edges: edges.filter(e => e.from === n.id) }));
    const nodesJson = JSON.stringify(nodesWithEdges);
    const script = GENERATE_DIAGRAM_SCRIPT(nodesJson);
    const result = await this.viewProvider!.executeInBrowserView(script);

    if (result?.error) {
      return this.toolError(result.error);
    }

    return this.toolResult(JSON.stringify({
      success: true,
      nodesCreated: result.nodesCreated,
      connectorsCreated: result.connectorsCreated,
      message: `Created ${result.nodesCreated} nodes and ${result.connectorsCreated} connectors in FigJam.`,
    }, null, 2));
  }

  /** Parse Mermaid syntax into nodes and edges. */
  private parseMermaid(src: string): { nodes: { id: string; label: string; shape: string }[]; edges: { from: string; to: string; label: string }[] } {
    const nodes = new Map<string, { id: string; label: string; shape: string }>();
    const edges: { from: string; to: string; label: string }[] = [];
    // Pre-process: split on newlines + semicolons, strip directives, expand chains (A-->B-->C → A-->B, B-->C)
    const NODE_PAT = '[\\w]+(?:\\[[^\\]]+\\]|\\([^)]+\\)|\\{[^}]+\\})?';
    const ARROW_PAT = '(?:-->|==>|-\\.->|---)';
    const EL_PAT = '(?:\\|[^|]*\\|)?';
    const firstNodeRe = new RegExp(`^(${NODE_PAT})`);
    const contRe = new RegExp(`^\\s*(${ARROW_PAT})\\s*(${EL_PAT})\\s*(${NODE_PAT})`);
    const directiveRe = /^(?:graph|flowchart|stateDiagram|sequenceDiagram|gantt|title|section|dateFormat|axisFormat)\s*(?:TD|LR|TB|RL|BT)?\s*;?\s*(.*)/i;

    const lines: string[] = [];
    for (const raw of src.split(/[\n;]/).map(l => l.trim()).filter(l => l && !l.startsWith('%%'))) {
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
      const em = line.match(/^\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?\s*(?:-->|==>|-.->|---)\s*(?:\|([^|]*)\|)?\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?/);
      if (em) {
        const fId = em[1], fL = em[2]||em[3]||em[4]||em[1], eL = em[5]||'', tId = em[6], tL = em[7]||em[8]||em[9]||em[6];
        const fS = em[4]?'DIAMOND':em[3]?'ELLIPSE':'ROUNDED_RECTANGLE';
        const tS = em[9]?'DIAMOND':em[8]?'ELLIPSE':'ROUNDED_RECTANGLE';
        if (!nodes.has(fId)) nodes.set(fId, { id: fId, label: fL, shape: fS });
        if (!nodes.has(tId)) nodes.set(tId, { id: tId, label: tL, shape: tS });
        edges.push({ from: fId, to: tId, label: eL.trim() });
        continue;
      }

      // Standalone node: A["Label"]
      const nm = line.match(/^\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})\s*$/);
      if (nm) {
        const id = nm[1], label = nm[2]||nm[3]||nm[4]||id;
        const shape = nm[4]?'DIAMOND':nm[3]?'ELLIPSE':'ROUNDED_RECTANGLE';
        if (!nodes.has(id)) nodes.set(id, { id, label, shape });
        continue;
      }

      // Sequence diagram: Actor ->> Actor: message
      const sm = line.match(/^\s*([\w\s]+?)\s*(?:->>|-->>|->|-->)\s*([\w\s]+?)\s*:\s*(.+)$/);
      if (sm) {
        const fId = sm[1].trim().replace(/\s+/g,'_'), tId = sm[2].trim().replace(/\s+/g,'_');
        if (!nodes.has(fId)) nodes.set(fId, { id: fId, label: sm[1].trim(), shape: 'ROUNDED_RECTANGLE' });
        if (!nodes.has(tId)) nodes.set(tId, { id: tId, label: sm[2].trim(), shape: 'ROUNDED_RECTANGLE' });
        edges.push({ from: fId, to: tId, label: sm[3].trim() });
        continue;
      }

      // State diagram: StateA --> StateB : event
      const stm = line.match(/^\s*([\w]+)\s*-->\s*([\w]+)\s*(?::\s*(.+))?$/);
      if (stm) {
        if (!nodes.has(stm[1])) nodes.set(stm[1], { id: stm[1], label: stm[1], shape: 'ROUNDED_RECTANGLE' });
        if (!nodes.has(stm[2])) nodes.set(stm[2], { id: stm[2], label: stm[2], shape: 'ROUNDED_RECTANGLE' });
        edges.push({ from: stm[1], to: stm[2], label: (stm[3]||'').trim() });
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
    this.log.info("Code Connect mapping added:", nodeId, "→", codeConnectName, `(${codeConnectSrc})`);

    return this.toolResult(JSON.stringify({
      success: true,
      nodeId,
      codeConnectSrc,
      codeConnectName,
      totalMappings: this.codeConnectMap.size,
    }, null, 2));
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
        lines.push(`| ${entry.nodeId} | \`${entry.codeConnectName}\` | \`${entry.codeConnectSrc}\` |`);
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

    const result = await this.viewProvider!.executeInBrowserView(SEARCH_DESIGN_SYSTEM_SCRIPT(query));
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
    const result = await this.viewProvider!.executeInBrowserView(USE_FIGMA_SCRIPT(action, paramsJson));
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
    return (
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "localhost"
    );
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

