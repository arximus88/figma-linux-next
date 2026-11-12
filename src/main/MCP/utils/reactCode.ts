/**
 * get_design_context as React + Tailwind (issue #89).
 *
 * Figma's remote server answers get_design_context with a React component
 * styled with Tailwind's arbitrary values, asset URLs as constants on top;
 * agents and skills written for it (figma-design-to-code) expect that shape.
 * This builds the same from the markup scripts/designContext.ts writes: one
 * JSX element per layer, `data-node-id` / `data-name` kept so the agent can
 * ask about a layer again.
 *
 * Like the remote output it is a reference to adapt, not a component to ship:
 * sizes are Figma's pixels and nothing is mapped to the project's own tokens.
 */

import type { CodeConnectEntry } from "../types";
import { isElement, type MarkupElement, type MarkupNode } from "./markup";
import { splitTopLevel, tailwindFor } from "./tailwind";

export interface ReactCodeInput {
  nodes: MarkupNode[];
  /** Text style name → CSS declarations (the markup only names the style). */
  textStyleCss: Record<string, string>;
  /** Layer id → URL of its SVG, for the vector groups the markup collapsed to `<svg/>`. */
  svgUrls: Record<string, string>;
  /** Image hash → URL of the original image. */
  imageUrls: Record<string, string>;
  /** Layers mapped to code components (add_code_connect_map); omitted to ignore them. */
  codeConnect?: Map<string, CodeConnectEntry>;
}

export interface ReactCode {
  code: string;
  /** Vector groups and image fills that have no URL (export failed or over the cap). */
  missingAssets: number;
}

/** `Lesson / Overview` → `LessonOverview`; always a valid identifier. */
export function pascalCase(name: string, fallback: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const joined = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  if (!joined) return fallback;
  return /^[0-9]/.test(joined) ? fallback + joined : joined;
}

const SCALE_CLASSES: Record<string, string[]> = {
  fill: ["bg-cover", "bg-center", "bg-no-repeat"],
  crop: ["bg-cover", "bg-center", "bg-no-repeat"],
  fit: ["bg-contain", "bg-center", "bg-no-repeat"],
  tile: ["bg-repeat"],
};

const IMAGE_LAYER = /^image\(([a-z]+)(?:\s+([0-9a-f]+))?\)$/;

/** Drawn shapes: no HTML element paints them, so they are exported as SVG files like icons. */
export const VECTOR_TAGS = new Set([
  "svg",
  "vector",
  "star",
  "polygon",
  "line",
  "boolean-operation",
]);
const VECTOR_ONLY_PROPS = ["color", "fill", "stroke", "stroke-width"];

/** An ellipse as a box: `fill` and `stroke` are SVG properties a div ignores. */
function ellipseStyle(style: string): string {
  const out: string[] = [];
  let stroke = "";
  let width = "1px";
  for (const declaration of style.split(";")) {
    if (declaration.startsWith("fill:")) out.push(`background:${declaration.slice(5)}`);
    else if (declaration.startsWith("stroke:")) stroke = declaration.slice(7);
    else if (declaration.startsWith("stroke-width:")) width = declaration.slice(13);
    else if (declaration) out.push(declaration);
  }
  if (stroke) out.push(`border:${width} solid ${stroke}`);
  out.push("border-radius:9999px");
  return out.join(";");
}

function jsxAttr(name: string, value: string): string {
  return /["\\\n{}]/.test(value) ? `${name}={${JSON.stringify(value)}}` : `${name}="${value}"`;
}

/** Text as a JSX child: braces, angle brackets, entities and edge whitespace need an expression. */
function jsxText(text: string): string {
  return /[{}<>&]|^\s|\s$/.test(text) ? `{${JSON.stringify(text)}}` : text;
}

/**
 * A text layer with mixed runs carries its font on each `<span>`. What every
 * run shares belongs on the paragraph: the line box takes its height from the
 * paragraph's own line-height, so with it only on the spans a browser spaced
 * the lines by its default instead (seen rendering the output, 2026-11-13).
 */
function hoistSharedRunStyle(text: MarkupElement): MarkupElement {
  const runs = text.children.filter(isElement).filter((el) => el.tag === "span");
  if (runs.length < 2 || runs.length !== text.children.length) return text;
  const lists = runs.map((run) => (run.attrs.style ?? "").split(";").filter(Boolean));
  const shared = lists[0].filter((d) => lists.every((list) => list.includes(d)));
  const sameStyleName = runs.every(
    (run) => run.attrs["text-style"] === runs[0].attrs["text-style"],
  );
  if (!shared.length && !(sameStyleName && runs[0].attrs["text-style"])) return text;

  const own = (text.attrs.style ?? "").split(";").filter(Boolean);
  const attrs: Record<string, string> = { ...text.attrs, style: [...own, ...shared].join(";") };
  if (sameStyleName && runs[0].attrs["text-style"])
    attrs["text-style"] = runs[0].attrs["text-style"];
  return {
    ...text,
    attrs,
    children: runs.map((run, i) => {
      const { "text-style": named, ...rest } = run.attrs;
      const runAttrs: Record<string, string> = {
        ...rest,
        style: lists[i].filter((d) => !shared.includes(d)).join(";"),
      };
      if (named && !sameStyleName) runAttrs["text-style"] = named;
      return { ...run, attrs: runAttrs };
    }),
  };
}

export function buildReactCode(input: ReactCodeInput): ReactCode {
  const consts: string[] = [];
  const constByUrl = new Map<string, string>();
  const usedNames = new Set<string>();
  const imports = new Map<string, string>();
  let missingAssets = 0;

  const assetConst = (url: string, name: string): string => {
    const known = constByUrl.get(url);
    if (known) return known;
    const base = `img${pascalCase(name, "Asset")}`;
    let id = base;
    for (let n = 2; usedNames.has(id); n++) id = `${base}${n}`;
    usedNames.add(id);
    constByUrl.set(url, id);
    consts.push(`const ${id} = ${JSON.stringify(url)};`);
    return id;
  };

  /** Classes and inline style entries (`key: expression`) for one element. */
  const styling = (el: MarkupElement, drop: string[] = []) => {
    const classes: string[] = [];
    const style: string[] = [];
    // An absolutely positioned child is placed against this element.
    const source =
      el.tag === "ellipse" ? ellipseStyle(el.attrs.style ?? "") : (el.attrs.style ?? "");
    const positioned = source.split(";").includes("position:absolute");
    const anchorsChild = el.children.some(
      (child) =>
        isElement(child) && (child.attrs.style ?? "").split(";").includes("position:absolute"),
    );
    if (anchorsChild && !positioned) classes.push("relative");
    const named = el.attrs["text-style"];
    if (named && input.textStyleCss[named]) {
      classes.push(...tailwindFor(input.textStyleCss[named]).classes);
    }

    const declarations: string[] = [];
    for (const declaration of source.split(";")) {
      if (!declaration.startsWith("background:")) {
        const prop = declaration.slice(0, declaration.indexOf(":"));
        if (!drop.includes(prop)) declarations.push(declaration);
        continue;
      }
      // Image fills become a background-image on the asset URL; the other
      // paint layers go through the ordinary mapping.
      const rest: string[] = [];
      for (const layer of splitTopLevel(declaration.slice("background:".length), ",")) {
        const image = IMAGE_LAYER.exec(layer);
        if (!image) {
          rest.push(layer);
          continue;
        }
        const url = image[2] ? input.imageUrls[image[2]] : undefined;
        if (!url) {
          missingAssets++;
          continue;
        }
        classes.push(...(SCALE_CLASSES[image[1]] ?? SCALE_CLASSES.fill));
        style.push(`backgroundImage: \`url(\${${assetConst(url, el.attrs.name ?? "image")}})\``);
      }
      if (rest.length) declarations.push(`background:${rest.join(", ")}`);
    }

    const mapped = tailwindFor(declarations.join(";"));
    classes.push(...mapped.classes);
    for (const [key, value] of Object.entries(mapped.inline)) {
      style.push(`${key}: ${JSON.stringify(value)}`);
    }
    return { classes, style };
  };

  const attributes = (el: MarkupElement, classes: string[], style: string[]): string => {
    const attrs: string[] = [];
    if (classes.length) attrs.push(jsxAttr("className", classes.join(" ")));
    if (style.length) attrs.push(`style={{ ${style.join(", ")} }}`);
    if (el.attrs.id) attrs.push(jsxAttr("data-node-id", el.attrs.id));
    if (el.attrs.name) attrs.push(jsxAttr("data-name", el.attrs.name));
    if (el.attrs.component) attrs.push(jsxAttr("data-component", el.attrs.component));
    if (el.attrs.variant) attrs.push(jsxAttr("data-variant", el.attrs.variant));
    return attrs.length ? ` ${attrs.join(" ")}` : "";
  };

  /** The children of a text layer, on one line: runs, spans and line breaks. */
  const inlineText = (nodes: MarkupNode[]): string =>
    nodes
      .map((node) => {
        if ("text" in node) return jsxText(node.text);
        if (!isElement(node)) return "";
        if (node.tag === "br") return "<br />";
        const { classes, style } = styling(node);
        const attrs = attributes(node, classes, style);
        // A run that differs in nothing from the paragraph needs no element.
        return attrs
          ? `<span${attrs}>${inlineText(node.children)}</span>`
          : inlineText(node.children);
      })
      .join("");

  const render = (node: MarkupNode, level: number): string => {
    const pad = "  ".repeat(level);
    if ("comment" in node) return `${pad}{/* ${node.comment.replace(/\*\//g, "* /")} */}\n`;
    if (!isElement(node)) return "";

    const mapping = node.attrs.id ? input.codeConnect?.get(node.attrs.id) : undefined;
    if (mapping) {
      const name = pascalCase(mapping.codeConnectName, "Component");
      imports.set(name, mapping.codeConnectSrc);
      return `${pad}<${name} ${jsxAttr("data-node-id", node.attrs.id)} />\n`;
    }

    if (VECTOR_TAGS.has(node.tag)) {
      const url = input.svgUrls[node.attrs.id];
      // The file carries its own colours; fill and stroke mean nothing on <img>.
      const { classes, style } = styling(node, VECTOR_ONLY_PROPS);
      if (!url) {
        missingAssets++;
        return `${pad}<div${attributes(node, classes, style)} />\n`;
      }
      const src = assetConst(url, node.attrs.name ?? "icon");
      return `${pad}<img alt="" src={${src}}${attributes(node, classes, style)} />\n`;
    }

    if (node.tag === "text") {
      const text = hoistSharedRunStyle(node);
      const { classes, style } = styling(text);
      return `${pad}<p${attributes(text, classes, style)}>${inlineText(text.children)}</p>\n`;
    }
    const { classes, style } = styling(node);

    const open = `${pad}<div${attributes(node, classes, style)}`;
    const cut = node.attrs.children;
    if (!node.children.length && !cut) return `${open} />\n`;
    let out = `${open}>\n`;
    for (const child of node.children) out += render(child, level + 1);
    if (cut) {
      out += `${pad}  {/* ${cut.replace(/: call again on this id$/, "")} layer(s): call get_design_context on ${node.attrs.id} */}\n`;
    }
    return `${out}${pad}</div>\n`;
  };

  const roots = input.nodes.filter((node) => isElement(node) || "comment" in node);
  const elements = roots.filter(isElement);
  const name = pascalCase(elements[0]?.attrs.name ?? "", "Component");
  const single = elements.length === 1 && roots.length === 1;
  let body = "";
  for (const root of roots) body += render(root, single ? 2 : 3);
  if (!single) body = `    <>\n${body}    </>\n`;

  const head: string[] = [];
  for (const [component, src] of imports) {
    head.push(`import { ${component} } from ${JSON.stringify(src)};`);
  }
  if (head.length && consts.length) head.push("");
  head.push(...consts);
  const code =
    (head.length ? `${head.join("\n")}\n\n` : "") +
    `export default function ${name}() {\n  return (\n${body}  );\n}\n`;
  return { code, missingAssets };
}
