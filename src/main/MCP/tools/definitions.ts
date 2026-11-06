/**
 * tools/definitions.ts -- MCP tool schemas.
 *
 * Tool names follow public Figma MCP documentation for compatibility with
 * Claude/Cursor. WRITE_TOOLS are gated behind a settings flag. Extracted
 * verbatim from McpServer.ts (Phase 3 of decomposition); no behavior change.
 */

import type { ToolAnnotations, ToolDefinition, ToolName } from "../types";

// ── Tool Definitions ───────────────────────────────────────────────────────────
// Tool names follow public Figma MCP documentation for compatibility with Claude/Cursor.

const BASE_TOOLS: ToolDefinition[] = [
  {
    name: "get_design_context",
    description:
      "Get the design context for a layer or your selection in Figma: one element per visible " +
      "layer with the CSS it needs (flex layout, sizes, colours, borders, radii, shadows, fonts), " +
      "bound variables as var(--name, value), text style names, component and variant names, " +
      "then legends defining the variables, text styles and components used (with their " +
      "descriptions). A reference to adapt to the target project, not code to paste. Repeated " +
      "instances of a component are written out once; icons collapse to <svg/> (download_assets " +
      "returns the files). When nodeId is omitted, uses the currently selected nodes. Pass a " +
      "frame, not a page: get_metadata lists a page's frames. " +
      "Supports Figma Design and Figma Make files.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID in '1:2' format. Omit to use current selection.",
        },
        depth: {
          type: "number",
          description:
            "Levels of layers to write out (default: 10). Deeper containers are cut off with a " +
            "note to call again on their id.",
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
      "Returns the variables and styles a layer (nodeId) or your selection uses, one per line: " +
      "the value the layer renders with (its mode, aliases followed to a colour or number), the " +
      "token an alias points at, the CSS variable from the variable's code syntax, and text " +
      "style definitions. With nothing selected and no nodeId: every local variable with its " +
      "value in each mode, and the local text styles. Supports Figma Design files.",
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
      "importComponentByKeyAsync / importComponentSetByKeyAsync, variable id/key for binding). " +
      "Components: this file's own (every page), then Figma's ranked asset search over every " +
      "team and community library you can reach, used in this file or not, with descriptions. " +
      "Variables: this file and its enabled libraries. Styles: this file only (Figma has " +
      "library style search turned off). Combine the searches " +
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
            "Only return library variables and components of these libraries (library name, or a key from earlier results).",
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
    name: "get_comments",
    description:
      "The comment threads on the file, read from figma.com with your session: each thread's id, " +
      "the layer it is pinned to (id and name), author, date and text, with its replies. " +
      "Resolved threads are left out unless includeResolved is true. Works in view-only files.",
    inputSchema: {
      type: "object",
      properties: {
        includeResolved: {
          type: "boolean",
          description: "Also list resolved threads (default false).",
        },
      },
    },
  },
  {
    name: "get_versions",
    description:
      "The file's version history, newest first: version id, date, author, and the label and " +
      "description of named versions (the rest are autosaves). Works in view-only files.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many versions to list (default 20, max 100)." },
        namedOnly: { type: "boolean", description: "Only versions someone named or described." },
      },
    },
  },
  {
    name: "list_libraries",
    description:
      "Every library you can use (team, organization and community), with which ones are " +
      "enabled in this file, their component/style/variable counts, team and file key. Library " +
      "names work wherever a library is asked for.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_library_styles",
    description:
      "The published styles of a library (colour, text, effect, grid), with keys for " +
      "importStyleByKeyAsync and descriptions. search_design_system covers this file's styles only; " +
      "use this for a library's.",
    inputSchema: {
      type: "object",
      properties: {
        library: { type: "string", description: "Library name (from list_libraries) or file key." },
        query: { type: "string", description: "Only styles whose name contains this." },
      },
      required: ["library"],
    },
  },
  {
    name: "get_library_updates",
    description:
      "Library changes this file has not accepted yet: components, component sets, styles and " +
      "variable collections with newer published versions (pages loaded so far).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_code_connect",
    description:
      "Code Connect snippets for an instance, or for the instances inside a frame: the code " +
      "component, its import and props as the design system team published them, so you reuse " +
      "the real component instead of writing new markup. Empty when the library has no " +
      "published mappings (they are published with the figma CLI; Pro plans allow one library " +
      "and framework pair).",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        label: { type: "string", description: "Framework label, e.g. React (default: all)." },
      },
      required: ["nodeId"],
    },
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

// What each tool does to the user's file, as MCP annotations. A Record over
// every ToolName, so a new tool does not compile until it says. Mirrors how
// Figma's remote server labels the same tools: reads are read-only, tools that
// only add (a node, a file, a diagram) carry no hint beyond destructive=false,
// tools that can change or delete existing layers are destructive, and the
// ones that send prompts to a generative model are open-world.
const READ: ToolAnnotations = { readOnlyHint: true };
const ADDS: ToolAnnotations = { readOnlyHint: false, destructiveHint: false };
const CHANGES: ToolAnnotations = { readOnlyHint: false, destructiveHint: true };

export const TOOL_ANNOTATIONS: Record<ToolName, ToolAnnotations> = {
  get_design_context: READ,
  get_metadata: READ,
  get_file_info: READ,
  get_screenshot: READ,
  get_variable_defs: READ,
  get_code_connect_map: READ,
  // Kept in the server's memory for the session; the file is not touched.
  add_code_connect_map: ADDS,
  create_design_system_rules: READ,
  get_figjam: READ,
  generate_diagram: ADDS,
  search_design_system: READ,
  figma_find: READ,
  figma_tree: READ,
  whoami: READ,
  get_comments: READ,
  get_versions: READ,
  list_libraries: READ,
  get_library_styles: READ,
  get_library_updates: READ,
  get_code_connect: READ,
  download_assets: READ,
  use_figma: CHANGES,
  create_new_file: ADDS,
  upload_assets: ADDS,
  figma_text: CHANGES,
  // Figma's agent runs its own code in the file: it can edit or delete layers.
  figma_agent_prompt: { ...CHANGES, openWorldHint: true },
  figma_agent_threads: READ,
  figma_agent_read: READ,
  figma_ai_credits: READ,
  figma_ai_generate_image: { ...ADDS, openWorldHint: true },
  // replace: true swaps the source layer's image fill.
  figma_ai_edit_image: { ...CHANGES, openWorldHint: true },
};

function withFileKey(tools: ToolDefinition[]): ToolDefinition[] {
  return tools
    .map((t) => ({ ...t, annotations: TOOL_ANNOTATIONS[t.name] }))
    .map((tool) =>
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

/**
 * The third tier: Figma's own AI (its agent, image generation, credits). They
 * spend the user's Figma AI credits, so they sit behind their own switch.
 */
const BASE_AI_TOOLS: ToolDefinition[] = [
  {
    name: "figma_agent_prompt",
    description:
      "Give Figma's own AI agent (the editor's Agents tab) a task in the file and wait for it to " +
      "finish. It reads and edits the file itself with Figma's internal tools and design " +
      "knowledge. Use it as a sub-agent: hand it a self-contained task (include any code, " +
      "copy or specs it needs in the prompt; it cannot see your files), then check its work " +
      "with get_design_context or get_screenshot. Returns the thread id, outcome, the agent's " +
      "answer, the tools it ran, the nodes it created/modified/deleted and the credits spent. " +
      "Pass threadId to continue a conversation. Spends Figma AI credits (a few per prompt, " +
      "more for long tasks). Design work takes minutes: the call returns after timeoutSeconds " +
      "with the thread id and outcome 'still running' while the agent keeps working; then " +
      "call figma_agent_read with that id until the outcome is done.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The task, in plain language." },
        threadId: {
          type: "string",
          description: "Continue this thread instead of starting a new one.",
        },
        nodeIds: {
          type: "array",
          items: { type: "string" },
          description: "Layers to attach to the prompt, as if selected.",
        },
        title: { type: "string", description: "Name for the thread, shown in Figma's Agents tab." },
        timeoutSeconds: {
          type: "number",
          description:
            "How long to wait before returning (default 40, max 900). Most MCP clients abort a " +
            "call after about a minute; raise this only if yours allows longer.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "figma_agent_threads",
    description:
      "List the Figma agent's conversation threads in the file: id, last update, title and how " +
      "the last prompt ended. Free.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "figma_agent_read",
    description:
      "Read a Figma agent thread: for each exchange the prompt, the answer, the tools the agent " +
      "ran (with their code) and the nodes it changed. Free.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string" },
        last: { type: "number", description: "How many of the latest exchanges (default 3)." },
      },
      required: ["threadId"],
    },
  },
  {
    name: "figma_ai_credits",
    description:
      "Your Figma AI credit balance on the plan of the open file: available, monthly total, " +
      "reset date, and the plan's shared pool if any. Free.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "figma_ai_generate_image",
    description:
      "Generate an image with Figma AI from a text prompt. Saves the PNG to disk (savedTo), " +
      "places it on the canvas as a rectangle with an image fill unless placeOnCanvas is false, " +
      "and returns a small preview, the node id, and the credits before/after. width/height " +
      "set the aspect ratio; the output is about 1024 px on the short side. Models: " +
      "gemini-3.1-flash-lite-image (default, Figma's own default), gemini-3.1-flash-image, " +
      "gpt-image-2.5-sunburst (cheapest). Spends Figma AI credits; takes about 15 s.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        negativePrompt: { type: "string", description: "What to avoid." },
        width: { type: "number", description: "Aspect width (default 1024)." },
        height: { type: "number", description: "Aspect height (default 1024)." },
        model: { type: "string" },
        seed: { type: "number" },
        placeOnCanvas: { type: "boolean", description: "Default true." },
        savePath: {
          type: "string",
          description: "Where to write the PNG; relative paths resolve against the export folder.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "figma_ai_edit_image",
    description:
      "Change an image in the file with Figma AI. nodeId is a layer with an image fill (vectorize " +
      "takes any layer). Operations: edit (needs prompt, e.g. 'make it night'), expand (outpaint " +
      "by expand {top,right,bottom,left} px; the image must have no transparency), " +
      "remove_background, upscale (2x or 4x via scale, source 16-2048 px), vectorize (to SVG, " +
      "placed as vector layers). The result goes next to the source, or replaces its fill " +
      "with replace: true, and is saved to disk. Returns a preview, the node id and credits " +
      "before/after. Spends Figma AI credits.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string" },
        operation: {
          type: "string",
          enum: ["edit", "expand", "remove_background", "upscale", "vectorize"],
        },
        prompt: { type: "string", description: "For edit." },
        expand: {
          type: "object",
          properties: {
            top: { type: "number" },
            right: { type: "number" },
            bottom: { type: "number" },
            left: { type: "number" },
          },
        },
        scale: { type: "number", enum: [2, 4], description: "For upscale (default 2)." },
        model: { type: "string", description: "For edit; same models as figma_ai_generate_image." },
        replace: {
          type: "boolean",
          description: "Replace the source's image fill (default false).",
        },
        savePath: { type: "string" },
      },
      required: ["nodeId", "operation"],
    },
  },
];
export const AI_TOOLS: ToolDefinition[] = withFileKey(BASE_AI_TOOLS);

/** Every tool by tier, name and description only: what the settings page lists. */
export function mcpToolList(): Types.McpToolList {
  const brief = (tools: ToolDefinition[]) =>
    tools.map(({ name, description }) => ({ name, description }));
  return { read: brief(TOOLS), write: brief(WRITE_TOOLS), ai: brief(AI_TOOLS) };
}
