/**
 * tools/definitions.ts -- MCP tool schemas.
 *
 * Tool names follow public Figma MCP documentation for compatibility with
 * Claude/Cursor. WRITE_TOOLS are gated behind a settings flag. Extracted
 * verbatim from McpServer.ts (Phase 3 of decomposition); no behavior change.
 */

import type { ToolDefinition } from "../types";

// ── Tool Definitions ───────────────────────────────────────────────────────────
// Tool names follow public Figma MCP documentation for compatibility with Claude/Cursor.

const BASE_TOOLS: ToolDefinition[] = [
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
      "Returns a local URL (http://127.0.0.1:<mcpPort>/assets/<id>.png, on the MCP server's " +
      "configured port) that can be fetched " +
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
          description:
            "Optional path to save the PNG on disk (absolute or relative to cwd). E.g. 'assets/frame.png' or '/tmp/design.png'. If omitted, image is returned inline only.",
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
          description:
            "Node ID in '1:2' format. Omit to use current selection or get all file variables.",
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
          description:
            "File path or URL of the code component (e.g., 'src/components/Button.tsx').",
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
          description:
            "Tech stack description (e.g., 'React + Tailwind CSS', 'Svelte + vanilla CSS').",
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
          description:
            "Mermaid diagram syntax (e.g., 'graph TD; A[Start]-->B{Decision}; B-->|Yes|C[End];').",
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
  {
    name: "figma_find",
    description:
      "Finds nodes in the current page (or under a given nodeId) matching a name " +
      "substring, node type, and/or text content. Returns a compact list of " +
      "{id, name, type, path} — far cheaper than get_design_context for locating " +
      "a node before reading or editing it. Use this to discover node IDs. " +
      "Supports Figma Design and FigJam files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Optional root node to search under. Defaults to the current page.",
        },
        query: {
          type: "string",
          description: "Case-insensitive substring matched against node names.",
        },
        type: {
          type: "string",
          description: "Node type filter, e.g. FRAME, TEXT, COMPONENT, INSTANCE (prefix match).",
        },
        text: {
          type: "string",
          description: "Substring matched against the characters of TEXT nodes.",
        },
        limit: {
          type: "number",
          description: "Maximum matches to return (default 100).",
        },
      },
      required: [],
    },
  },
  {
    name: "figma_tree",
    description:
      "Returns a compact indented text outline of the scene graph under a node " +
      "(or the current page) — one line per node as 'type name #id'. Much cheaper " +
      "than get_design_context for navigating structure. Supports Figma Design and " +
      "FigJam files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Optional root node. Defaults to the current page.",
        },
        maxDepth: {
          type: "number",
          description: "Maximum tree depth to walk (default 5).",
        },
      },
      required: [],
    },
  },
];

// ── Write Tool Definitions (gated by settings) ──────────────────────────────

const BASE_WRITE_TOOLS: ToolDefinition[] = [
  {
    name: "use_figma",
    description:
      "Create, edit, inspect or delete anything in a Figma file by running JavaScript against " +
      "the Figma Plugin API — the same contract as Figma's remote use_figma tool, so its " +
      "figma-use skill applies. `code` is the BODY of an async function: `figma` is in scope, " +
      "use top-level `await` and `return` (the returned value, JSON-serialized, is the only " +
      "output; console.log is not returned; nodes come back as {id, name, type}). Do not wrap " +
      "it in an IIFE and do not call figma.closePlugin(). Atomic: if the script throws, the " +
      "changes it made are undone and the error says so. On success the whole script is one " +
      "undo step for the user. Return the ids of every node you create or change. Examples: " +
      "`const c = await figma.importComponentByKeyAsync(key); const i = c.createInstance(); " +
      "return { createdNodeIds: [i.id] };` — load fonts with `await figma.loadFontAsync(...)` " +
      "before editing text; switch pages with `await figma.setCurrentPageAsync(page)`. " +
      "Runs in the tab showing `fileKey`, or the active tab when omitted. " +
      "Legacy form: `action` + `params` (create_frame, create_text, create_rectangle, " +
      "update_node, delete_node, set_variable, reparent_node) still works. " +
      "⚠ This is a WRITE tool that modifies the file.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          maxLength: 50000,
          description:
            "JavaScript to execute, the body of an async function with `figma` (Plugin API) in scope. Use `return` for output.",
        },
        description: {
          type: "string",
          maxLength: 2000,
          description: "A concise description of what the code aims to do (logged).",
        },
        action: {
          type: "string",
          description: "Legacy: one fixed action instead of `code`.",
          enum: [
            "create_frame",
            "create_text",
            "create_rectangle",
            "update_node",
            "delete_node",
            "set_variable",
            "reparent_node",
          ],
        },
        params: {
          type: "object",
          description:
            "Legacy: parameters for `action`. " +
            "create_frame: name, width, height, x, y, fills, strokes, strokeWeight, strokeAlign, cornerRadius, parentNodeId, layoutMode, padding*, itemSpacing, *AxisAlignItems, *AxisSizingMode. " +
            "create_rectangle: name, width, height, x, y, fills, strokes, strokeWeight, strokeAlign, cornerRadius, parentNodeId. " +
            "create_text: name, characters, fontFamily, fontStyle, fontSize, fills, x, y, parentNodeId. " +
            "update_node: nodeId plus any of the above, characters, opacity, visible. " +
            "delete_node: nodeId. reparent_node: nodeId, parentNodeId. " +
            "set_variable: name, collectionName, resolvedType (COLOR/FLOAT/STRING/BOOLEAN), value.",
        },
      },
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
  {
    name: "figma_text",
    description:
      "Sets the text content of an existing TEXT node, automatically loading the " +
      "node's font(s) first (handles mixed fonts across segments). Safer and more " +
      "token-efficient than use_figma update_node for the common 'edit text' case. " +
      "⚠ This is a WRITE tool that modifies the file.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "ID of the TEXT node to edit.",
        },
        characters: {
          type: "string",
          description: "New text content.",
        },
      },
      required: ["nodeId", "characters"],
    },
  },
];

// ── fileKey on every tool ─────────────────────────────────────────────────────

/**
 * Figma's remote MCP addresses files by `fileKey`. Here it is optional: given,
 * the tool runs in the open tab showing that file (an error if none does);
 * omitted, it runs in the active tab as before. A pasted figma.com URL works too.
 */
const FILE_KEY_PROPERTY = {
  type: "string",
  description:
    "Key of the Figma file to act on (the id in figma.com/design/<fileKey>/…; a full file URL also works). " +
    "The file must be open in a tab of the app. Omit to use the active tab.",
};

/** Tools that never touch a file: code-connect bookkeeping lives in the server. */
const NO_FILE_TOOLS = new Set(["get_code_connect_map", "add_code_connect_map"]);

function withFileKey(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) =>
    NO_FILE_TOOLS.has(tool.name)
      ? tool
      : {
          ...tool,
          inputSchema: {
            ...tool.inputSchema,
            properties: {
              ...(tool.inputSchema.properties as Record<string, unknown> | undefined),
              fileKey: FILE_KEY_PROPERTY,
            },
          },
        },
  );
}

export const TOOLS: ToolDefinition[] = withFileKey(BASE_TOOLS);
export const WRITE_TOOLS: ToolDefinition[] = withFileKey(BASE_WRITE_TOOLS);
