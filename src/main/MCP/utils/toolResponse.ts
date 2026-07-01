/**
 * toolResponse.ts — MCP tool-result envelopes.
 *
 * Shared by the JSON-RPC dispatcher and the individual tool handlers.
 * Extracted from McpServer.ts (Phase 7 of decomposition).
 */

import { withHint } from "./errorHints";

/** A successful tool result carrying a single text block. */
export function toolResult(text: string) {
  return { content: [{ type: "text", text }] };
}

/**
 * An error tool result (isError flag per MCP spec). The text is enriched with
 * an actionable hint when the error matches a known pattern (see errorHints.ts).
 */
export function toolError(text: string) {
  return { isError: true, content: [{ type: "text", text: withHint(text) }] };
}

/**
 * Append a captured print()/logs section to a tool-result body. Returns the
 * body unchanged when there are no logs, so tools that never emit logs are
 * unaffected. Used by the execWithLogs path (see ToolHandlers).
 */
export function appendLogs(text: string, logs: string[]): string {
  if (!logs || logs.length === 0) return text;
  return `${text}\n\n--- logs ---\n${logs.join("\n")}`;
}
