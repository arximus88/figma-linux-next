/**
 * errorHints.ts — actionable advice appended to MCP tool errors.
 *
 * The Figma Plugin API throws terse, low-context errors ("Cannot read property
 * 'characters' of null", "fontName unloaded"). Without guidance the AI agent
 * burns turns guessing the fix. This table maps common error signatures to a
 * one-line hint that `withHint()` appends to the error text returned to the
 * client. Patterns are tried in order; the first match wins.
 */

export interface ErrorHint {
  /** Substring (case-insensitive) or RegExp tested against the error text. */
  match: string | RegExp;
  /** Advice appended after the error, prefixed with "Hint: ". */
  hint: string;
}

export const ERROR_HINTS: ErrorHint[] = [
  {
    match: /unloaded font|font.*not.*loaded|loadFontAsync/i,
    hint: "load the font before setting characters — use the figma_text tool (it auto-loads fonts), or await figma.loadFontAsync(node.fontName) first.",
  },
  {
    match: /Figma Plugin API not available/i,
    hint: "ensure a Figma design file is open and fully loaded in the active tab before calling design tools.",
  },
  {
    match: /node not found|getNodeById.*null|no node with/i,
    hint: 'the nodeId may be stale or wrong. Use figma_find or get_metadata to locate a current node id (ids look like "123:456").',
  },
  {
    match: /createShapeWithText|createConnector|only.*figjam|requires.*figjam/i,
    hint: "this operation only works in a FigJam file, not a Design file. Open a FigJam board first.",
  },
  {
    match: /appendChild|cannot have children|not a container/i,
    hint: "create the node, then call parent.appendChild(node) BEFORE setting layoutMode/resize/fills — appendChild resets fills to the parent default.",
  },
  {
    match: /no node|nothing selected|empty selection|selection is empty/i,
    hint: "no node is selected. Pass an explicit nodeId, or select a node in Figma first.",
  },
  {
    match: /read only property|cannot assign to read only|object is not extensible|frozen/i,
    hint: "Figma returns frozen arrays (fills/strokes/effects). Clone before mutating: const f = JSON.parse(JSON.stringify(node.fills)).",
  },
];

/**
 * Append the first matching hint to an error string. Returns the text unchanged
 * when no pattern matches. Safe on empty/undefined-ish input.
 */
export function withHint(text: string): string {
  if (!text) return text;
  for (const { match, hint } of ERROR_HINTS) {
    const hit =
      typeof match === "string"
        ? text.toLowerCase().includes(match.toLowerCase())
        : match.test(text);
    if (hit) return `${text}\n\nHint: ${hint}`;
  }
  return text;
}
