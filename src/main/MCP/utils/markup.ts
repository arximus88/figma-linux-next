/**
 * Parser for the markup get_design_context writes (scripts/designContext.ts).
 *
 * Not a general XML parser: it reads exactly what that script emits — one
 * element per layer, double-quoted attributes escaped with &amp; &quot; &lt;
 * &gt;, text bodies with <br/> and <span>, and comments for layers that threw.
 * The React output is built from this tree, so the page script stays the one
 * place that reads Figma's layers.
 */

export interface MarkupElement {
  tag: string;
  attrs: Record<string, string>;
  children: MarkupNode[];
}

/** An element, a run of text (already unescaped), or a comment. */
export type MarkupNode = MarkupElement | { text: string } | { comment: string };

const TOKEN =
  /<!--([\s\S]*?)-->|<\/([a-z][a-z0-9-]*)>|<([a-z][a-z0-9-]*)((?:\s+[a-z][a-z0-9-]*="[^"]*")*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([a-z][a-z0-9-]*)="([^"]*)"/g;

export function unescapeMarkup(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Tags whose text content is meaningful; elsewhere whitespace between elements is layout. */
const TEXT_TAGS = new Set(["text", "span"]);

export function parseMarkup(markup: string): MarkupNode[] {
  const root: MarkupElement = { tag: "", attrs: {}, children: [] };
  const stack: MarkupElement[] = [root];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(markup); m; m = TOKEN.exec(markup)) {
    const parent = stack[stack.length - 1];
    const [, comment, closing, opening, attrText, selfClosing, text] = m;
    if (comment !== undefined) {
      parent.children.push({ comment: comment.trim() });
    } else if (closing !== undefined) {
      // A stray closing tag is ignored; a matching one closes back to it.
      const at = stack.map((el) => el.tag).lastIndexOf(closing);
      if (at > 0) stack.length = at;
    } else if (opening !== undefined) {
      const attrs: Record<string, string> = {};
      ATTR.lastIndex = 0;
      for (let a = ATTR.exec(attrText); a; a = ATTR.exec(attrText)) {
        attrs[a[1]] = unescapeMarkup(a[2]);
      }
      const element: MarkupElement = { tag: opening, attrs, children: [] };
      parent.children.push(element);
      if (!selfClosing) stack.push(element);
    } else if (text !== undefined) {
      if (TEXT_TAGS.has(parent.tag)) parent.children.push({ text: unescapeMarkup(text) });
    }
  }
  return root.children;
}

export const isElement = (node: MarkupNode): node is MarkupElement => "tag" in node;
