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

export const TOOLS: ToolDefinition[] = [
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
];

// ── Write Tool Definitions (gated by settings) ──────────────────────────────

export const WRITE_TOOLS: ToolDefinition[] = [
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
