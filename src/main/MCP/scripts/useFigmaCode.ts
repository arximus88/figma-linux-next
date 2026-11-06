import { PLUGIN_API_UNAVAILABLE } from "./helpers";

/**
 * use_figma `code` mode — the shape of Figma's remote MCP: `code` is the body of
 * an async function with the Plugin API as `figma`, top-level `await`, and
 * `return` as the only output channel.
 *
 * The code is inlined into the injected source rather than handed to
 * `new Function`: figma.com's CSP forbids eval in the page, while a script
 * injected through executeJavaScript is not subject to it. The caller checks
 * the syntax first (checkUseFigmaSyntax), because a syntax error in inlined
 * code would otherwise surface as Electron's bare "Script failed to execute".
 *
 * Atomic like the remote tool, which agents following Figma's figma-use skill
 * rely on: changes the script made before throwing are undone. The page's
 * `figma` has commitUndo/triggerUndo but fires no documentchange/nodechange
 * (measured live 2026-11-04), so the wrapper cannot see whether the script
 * changed anything — and an undo after an empty step reverts the user's own
 * last action (also measured). Instead it opens the script's undo step with a
 * marker of its own: commitUndo() seals the user's edits, then a shared-plugin-
 * data write on the document root (recorded by undo, invisible on the canvas)
 * guarantees the step is never empty. On error, commitUndo + triggerUndo
 * reverts exactly that step — marker and script changes — and the marker being
 * back to its previous value proves it. If the script called commitUndo itself,
 * the marker survives and the error says only the last part was undone. On
 * success the marker is restored in the same step, so the user sees the
 * script as one undo step and no leftover data.
 *
 * The result is serialized in the page: nodes become {id, name, type} (they are
 * not structured-cloneable), cycles and functions are dropped, and the size is
 * capped so one careless `return figma.root` cannot flood the client.
 */
export const USE_FIGMA_MAX_RESULT_CHARS = 200_000;
/** Same cap as Figma's remote use_figma. */
export const USE_FIGMA_MAX_CODE_CHARS = 50_000;

export const USE_FIGMA_CODE_SCRIPT = (code: string) => `
(async function () {
  const figma = window.figma;
  if (!figma) return { error: ${PLUGIN_API_UNAVAILABLE} };

  const NS = "fln_mcp", KEY = "txn";
  const token = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  let previous = "";
  let marked = false;
  try {
    previous = figma.root.getSharedPluginData(NS, KEY);
    figma.commitUndo();
    figma.root.setSharedPluginData(NS, KEY, token);
    marked = true;
  } catch (e) {}
  const settle = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  let value;
  try {
    value = await (async function (figma) {
${code}
    }).call(undefined, figma);
  } catch (err) {
    const message = (err && err.message) ? err.message : String(err);
    if (!marked) {
      return { error: message, rolledBack: false, note: "Undo is not available in this tab, so changes made before the error may remain; check with get_metadata." };
    }
    let note;
    let rolledBack = false;
    try {
      figma.commitUndo();
      figma.triggerUndo();
      await settle();
      const now = figma.root.getSharedPluginData(NS, KEY);
      if (now === previous) rolledBack = true;
      else note = "The script called figma.commitUndo(), so only the changes after its last commitUndo were undone; earlier ones remain.";
    } catch (e) {
      note = "Undoing failed (" + ((e && e.message) || e) + "); changes made before the error may remain.";
    }
    return { error: message, rolledBack: rolledBack, note: note };
  }
  try {
    if (marked) figma.root.setSharedPluginData(NS, KEY, previous);
    figma.commitUndo();
  } catch (e) {}

  const seen = new WeakSet();
  const json = JSON.stringify(value === undefined ? null : value, function (key, v) {
    if (typeof v === "function" || typeof v === "symbol") return undefined;
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object") {
      if (typeof v.id === "string" && typeof v.type === "string" && "removed" in v && "parent" in v) {
        return { id: v.id, name: v.name, type: v.type };
      }
      if (ArrayBuffer.isView(v)) return "<" + v.constructor.name + " " + v.length + ">";
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  });
  const max = ${USE_FIGMA_MAX_RESULT_CHARS};
  if (json && json.length > max) {
    return { result: json.slice(0, max), truncated: true, length: json.length };
  }
  return { result: json };
})()`;

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => unknown;

/**
 * Parse `code` as an async function body without running it. Returns the
 * SyntaxError message, or null when it parses. Done in main, where eval is
 * allowed, so the agent gets "Unexpected token ')'" instead of
 * "Script failed to execute".
 */
export function checkUseFigmaSyntax(code: string): string | null {
  try {
    new AsyncFunction("figma", code);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
