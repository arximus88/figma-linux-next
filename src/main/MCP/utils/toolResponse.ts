/**
 * toolResponse.ts — MCP tool-result envelopes.
 *
 * Shared by the JSON-RPC dispatcher and the individual tool handlers.
 * Extracted from McpServer.ts (Phase 7 of decomposition); no behavior change.
 */

/** A successful tool result carrying a single text block. */
export function toolResult(text: string) {
  return { content: [{ type: "text", text }] };
}

/** An error tool result (isError flag per MCP spec). */
export function toolError(text: string) {
  return { isError: true, content: [{ type: "text", text }] };
}
