/**
 * serialize.ts — defensive JSON serialization for tool results.
 *
 * Figma objects round-tripped through Electron's structured clone can carry
 * values that vanilla JSON.stringify chokes on or silently drops: circular
 * references throw, BigInt throws, Symbol/function/undefined are omitted. This
 * wrapper makes serialization total — it never throws and never silently loses
 * a key — so a single odd return value can't 500 a tool call.
 *
 * Scope: this is a Node-side helper. It does NOT touch the in-renderer
 * JSON.parse(JSON.stringify(node.fills)) frozen-array dance, which runs inside
 * the Figma webapp before IPC (see scripts/helpers.ts safeClone for that).
 */

export function safeStringify(value: unknown, space: number = 2): string {
  const seen = new WeakSet<object>();

  const replacer = (_key: string, val: unknown): unknown => {
    if (typeof val === "bigint" || typeof val === "symbol" || typeof val === "function") {
      return String(val);
    }
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  };

  // Top-level undefined would make JSON.stringify return undefined (not a
  // string); normalize to "null" so callers always get a valid text block.
  if (value === undefined) return "null";

  try {
    return JSON.stringify(value, replacer, space);
  } catch (err) {
    return JSON.stringify(
      { error: `serialization failed: ${(err as Error)?.message ?? String(err)}` },
      null,
      space,
    );
  }
}
