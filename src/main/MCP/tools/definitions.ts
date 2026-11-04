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
      "Sparse XML outline of the document — layer IDs, types, names, positions and sizes only " +
      "(no fills, strokes or styling). Without nodeId it lists the document's pages (id + name, " +
      "the current one marked), like Figma's remote get_metadata; pass a page id (e.g. '0:1') to " +
      "outline that page, or a node id to outline that node. When something is selected, the " +
      "response starts with a 'Currently selected nodes:' block. Use the ids with " +
      "get_design_context or use_figma. Supports Figma Design files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description:
            "Page or node ID ('1:2' or '1-2'). Omit to list the pages. Do not guess an id.",
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
        maxDimension: {
          type: "integer",
          minimum: 1,
          maximum: 65536,
          description:
            "Cap on the longer edge of the PNG in pixels (default 1024; small nodes render at up to 2x). " +
            "Raise it to inspect detail, lower it for thumbnails. The response gives width/height and " +
            "original_width/original_height.",
        },
        contentsOnly: {
          type: "boolean",
          description:
            "true renders the node in isolation, without overlapping layers that sit above it on the canvas. Default false: what the user sees.",
        },
        scale: {
          type: "number",
          description: "Fixed export scale (0.01–4). Overrides maxDimension; prefer maxDimension.",
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
      "Search design-system assets, Figma remote-MCP style. Pass `queries` as an array of objects, " +
      'never strings: [{"entity":"component","query":"button"},{"entity":"variable","query":"surface"}]. ' +
      "`entity` is exactly component, variable or style. Results come back in a `results` array in " +
      "the same order, each with the ids/keys needed next (component key for " +
      "importComponentByKeyAsync, variable id/key for binding). Scope: this file's components " +
      "(every page) and styles, library components the file already uses (found through its " +
      "instances), and variables from this file and its enabled libraries. Library components " +
      "the file does not use yet, and library styles, cannot be listed through the Plugin API. Combine the searches " +
      "you need in one call. The legacy `query` string still searches everything locally.",
    inputSchema: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              entity: { type: "string", enum: ["component", "variable", "style"] },
              query: { type: "string" },
            },
            required: ["entity", "query"],
          },
        },
        includeLibraryKeys: {
          type: "array",
          items: { type: "string" },
          description:
            "Only search variables of these libraries (library name or collection key from earlier results).",
        },
        query: {
          type: "string",
          description: "Legacy: one text query over local variables, styles and components.",
        },
      },
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
  {
    name: "whoami",
    description:
      "Who is signed in and what the current file belongs to: user id and name, and for the " +
      "tab's file its key, name, editor type, team/org ids, whether you can edit it, and the " +
      "plan key. Useful before create_new_file and to explain a view-only file.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "download_assets",
    description:
      "Download the assets of one node: `export` (a render of the whole node), `rawImages` (the " +
      "original images used as fills anywhere in its subtree, with their real format, max 20) and " +
      "`svgAssets` (SVGs of its vector parts such as icons and logos, max 20). Each comes as a " +
      "local URL on this server to fetch with curl; URLs expire after 10 minutes. Export " +
      "precedence: defaultFormat/defaultScale when given, else the node's own export settings, " +
      "else PNG at 1x. Use rawImages with upload_assets to move images between files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Node ID ('1:2' or '1-2')." },
        defaultFormat: { type: "string", enum: ["png", "jpg", "svg", "pdf"] },
        defaultScale: { type: "number", minimum: 0.01, maximum: 4 },
      },
      required: ["nodeId"],
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
      "Create a new Figma file and open it in a tab, like Figma's remote create_new_file. It is " +
      "created the way the app's New file button does it, in your drafts, and named `fileName`. " +
      "Returns the new fileKey and URL; pass the fileKey to use_figma and the other tools. " +
      "(This tool used to add a page to the current file; for that, use use_figma with " +
      "`figma.createPage()`.) ⚠ WRITE tool.",
    inputSchema: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Name for the new file." },
        editorType: {
          type: "string",
          enum: ["design", "figjam", "slides"],
          description: "Default design.",
        },
        planKey: {
          type: "string",
          description: "Accepted for compatibility; the file goes to your drafts.",
        },
        projectId: { type: "string", description: "Accepted for compatibility; not applied." },
      },
      required: ["fileName"],
    },
  },
  {
    name: "upload_assets",
    description:
      "Upload images or SVGs into a Figma file. Call with `count` to get that many single-use " +
      "upload URLs on this server, then POST the raw bytes to each with the right Content-Type " +
      "(image/png, image/jpeg, image/gif, image/webp, image/svg+xml; max 10 MB). With `nodeIds` " +
      "(one per URL, same order) a raster image becomes the fill of that existing node " +
      "(`scaleMode` FILL/FIT/TILE); otherwise a rectangle of the image's size is placed on " +
      "`currentPageId` (or the current page) right of the existing content. SVGs become editable " +
      "vector nodes. Each POST answers with the node it created or filled. URLs expire in 10 " +
      "minutes. ⚠ WRITE tool.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          minimum: 1,
          maximum: 60,
          description: "Number of upload URLs (default 1).",
        },
        nodeIds: {
          type: "array",
          items: { type: "string" },
          maxItems: 60,
          description: "Existing nodes to fill, one per upload URL. Length must equal count.",
        },
        nodeId: { type: "string", description: "Deprecated: one target node; use nodeIds." },
        scaleMode: { type: "string", enum: ["FILL", "FIT", "TILE"], description: "Default FILL." },
        currentPageId: { type: "string", description: "Page to place new image frames on." },
      },
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
