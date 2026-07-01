/**
 * nodeId.ts — Figma node-id normalization.
 *
 * MCP clients pass node ids with hyphens (e.g. "123-456"); the Figma Plugin
 * API expects colons ("123:456"). Centralizes the repeated inline conversion
 * from McpServer tool handlers.
 */

/** Normalize a tool-arg node id ("123-456" → "123:456"), or null if absent. */
export function normalizeNodeId(arg: unknown): string | null {
  return arg ? String(arg).replace(/-/g, ":") : null;
}
