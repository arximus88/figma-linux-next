/**
 * tools/remoteCompat.ts -- Figma remote-MCP names, so skills written for
 * mcp.figma.com run unchanged here (issue #92, sections 5-8).
 *
 * One place for everything that is only a different spelling of what this
 * server already does:
 *
 * - Session arguments. Figma's skills call `create_session` first and pass
 *   `sessionId` (sometimes `skillNames`, `userIntent`) to every file tool.
 *   They mean nothing here; `resolveToolCall` drops them before any handler
 *   sees the arguments, and `create_session` answers with a fresh UUID.
 * - Tool aliases: a remote tool name that runs a local tool.
 * - Parameter aliases: a remote parameter name copied onto the local one,
 *   unless the caller passed the local one too.
 *
 * No tool schema sets `additionalProperties: false` and the server validates
 * nothing against them, so an unknown argument was never rejected; it reached
 * the handler, which ignored it. The schemas still advertise `sessionId` so a
 * strict client (or one reading the schema to decide what to send) accepts it.
 */

import crypto from "node:crypto";

import type { CompatToolName, ToolDefinition, ToolName } from "../types";
import { toolResult } from "../utils/toolResponse";

/** Remote arguments that only tie calls to a remote session: dropped on every call. */
export const SESSION_ARGS = ["sessionId", "skillNames", "userIntent"] as const;

export const CREATE_SESSION = "create_session" satisfies CompatToolName;

/** Remote tool name → local tool it runs. */
export const TOOL_ALIASES = {
  get_libraries: "list_libraries",
  generate_image: "figma_ai_generate_image",
} as const satisfies Partial<Record<CompatToolName, ToolName>>;

export type AliasName = keyof typeof TOOL_ALIASES;

/** Per local tool: remote parameter name → local parameter name. */
export const PARAM_ALIASES: Partial<Record<ToolName, Record<string, string>>> = {
  generate_diagram: { mermaidSyntax: "mermaid" },
  add_code_connect_map: { componentName: "codeConnectName", source: "codeConnectSrc" },
  get_code_connect_map: { codeConnectLabel: "label" },
};

/**
 * The call a handler should see: alias resolved to its local tool, session
 * arguments dropped, remote parameter names copied to local ones.
 */
export function resolveToolCall(
  name: string,
  args: Record<string, unknown>,
): { name: string; args: Record<string, unknown> } {
  const local: string = TOOL_ALIASES[name as AliasName] ?? name;
  const out: Record<string, unknown> = { ...args };
  for (const key of SESSION_ARGS) delete out[key];
  const renames = PARAM_ALIASES[local as ToolName];
  if (renames) {
    for (const [remote, own] of Object.entries(renames)) {
      if (remote in out) {
        if (out[own] === undefined) out[own] = out[remote];
        delete out[remote];
      }
    }
  }
  return { name: local, args: out };
}

/** create_session: a UUID the caller passes back as sessionId, which is then ignored. */
export function createSessionResult() {
  return toolResult(
    JSON.stringify({
      sessionId: crypto.randomUUID(),
      note: "This server keeps no sessions; sessionId is accepted on every tool and ignored.",
    }),
  );
}

const SESSION_ID_PROPERTY = {
  type: "string",
  description: "Figma remote-MCP session id from create_session. Accepted and ignored here.",
};

export const CREATE_SESSION_TOOL: ToolDefinition = {
  name: CREATE_SESSION,
  description:
    "Figma remote-MCP compatibility: Figma's skills call this first and pass the returned " +
    "sessionId to every file tool. This server keeps no sessions; it returns a fresh UUID and " +
    "every tool accepts and ignores sessionId, skillNames and userIntent. Not needed otherwise.",
  inputSchema: {
    type: "object",
    properties: {
      fileKey: { type: "string", description: "Accepted and ignored." },
      description: { type: "string", description: "Accepted and ignored." },
    },
  },
  annotations: { readOnlyHint: true },
};

/** Extra schema text for an alias, on top of its target's. */
const ALIAS_EXTRAS: Record<
  AliasName,
  { description: string; properties?: Record<string, unknown> }
> = {
  get_libraries: {
    description:
      "Alias of list_libraries under Figma's remote-MCP name. Every library comes in one page, " +
      "so offset is accepted and ignored.",
    properties: { offset: { type: "integer", description: "Accepted and ignored." } },
  },
  generate_image: {
    description:
      "Alias of figma_ai_generate_image under Figma's remote-MCP name. With nodeId the image " +
      "replaces that layer's image fill without resizing it; without it a new rectangle is placed.",
  },
};

/**
 * `tools` with `sessionId` on every schema, followed by an alias definition
 * for each alias whose target is in `tools` (same tier, same schema, same
 * annotations), then `extra` tools.
 */
export function withRemoteCompat(
  tools: ToolDefinition[],
  extra: ToolDefinition[] = [],
): ToolDefinition[] {
  const withSession = tools.map((tool) => ({
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...(tool.inputSchema.properties as Record<string, unknown> | undefined),
        sessionId: SESSION_ID_PROPERTY,
      },
    },
  }));
  const aliases: ToolDefinition[] = [];
  for (const [alias, target] of Object.entries(TOOL_ALIASES) as [AliasName, ToolName][]) {
    const def = withSession.find((t) => t.name === target);
    if (!def) continue;
    const extras = ALIAS_EXTRAS[alias];
    aliases.push({
      ...def,
      name: alias,
      description: `${extras.description} ${def.description}`,
      inputSchema: {
        ...def.inputSchema,
        properties: {
          ...(def.inputSchema.properties as Record<string, unknown>),
          ...extras.properties,
        },
      },
    });
  }
  return [...withSession, ...aliases, ...extra];
}
