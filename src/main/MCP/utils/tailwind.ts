/**
 * CSS declarations → Tailwind classes, for the React output of
 * get_design_context. Covers the declarations scripts/designContext.ts emits;
 * anything else becomes an arbitrary property (`[prop:value]`), which Tailwind
 * accepts for any CSS, so nothing is dropped.
 *
 * Values are Figma's own (pixels, hex colours, `var(--token, fallback)`), so
 * they go in as arbitrary values rather than being snapped to a spacing scale
 * the target project may not share. Figma's remote server does the same.
 */

export interface TailwindResult {
  classes: string[];
  /** Declarations with no class form (layered backgrounds), as a React style object. */
  inline: Record<string, string>;
}

/** Split on a separator at the top level only: `var(--a, 4px) 8px` is two parts. */
export function splitTopLevel(value: string, separator: " " | ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === separator) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** A CSS value as Tailwind writes it inside `[...]`: no spaces. */
export function arbitrary(value: string): string {
  return value.trim().replace(/,\s+/g, ",").replace(/\s+/g, "_");
}

const isVar = (value: string) => value.trim().startsWith("var(");

/** `prefix-[value]`; a `var()` gets a type hint where Tailwind could not tell colour from size. */
function withHint(prefix: string, value: string, hint: string): string {
  return isVar(value)
    ? `${prefix}-[${hint}:${arbitrary(value)}]`
    : `${prefix}-[${arbitrary(value)}]`;
}

const WEIGHT_NAMES: Record<string, string> = {
  "100": "font-thin",
  "200": "font-extralight",
  "300": "font-light",
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
};

const KEYWORDS: Record<string, Record<string, string>> = {
  position: { absolute: "absolute", relative: "relative" },
  display: { flex: "flex", grid: "grid" },
  "flex-direction": { column: "flex-col", row: "flex-row" },
  "flex-wrap": { wrap: "flex-wrap" },
  "justify-content": {
    center: "justify-center",
    "flex-end": "justify-end",
    "space-between": "justify-between",
  },
  "align-items": { center: "items-center", "flex-end": "items-end", baseline: "items-baseline" },
  "align-self": { stretch: "self-stretch" },
  overflow: { hidden: "overflow-hidden" },
  "text-align": { center: "text-center", right: "text-right", justify: "text-justify" },
  "font-style": { italic: "italic" },
  "text-transform": { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize" },
  "text-decoration": { underline: "underline", "line-through": "line-through" },
};

const SIMPLE: Record<string, string> = {
  width: "w",
  height: "h",
  "min-width": "min-w",
  "max-width": "max-w",
  "min-height": "min-h",
  "max-height": "max-h",
  left: "left",
  top: "top",
  gap: "gap",
  "row-gap": "gap-y",
  "border-radius": "rounded",
  "box-shadow": "shadow",
  opacity: "opacity",
  "line-height": "leading",
  "letter-spacing": "tracking",
  flex: "flex",
};

function padding(value: string): string[] {
  const p = splitTopLevel(value, " ").map(arbitrary);
  if (p.length === 1) return [`p-[${p[0]}]`];
  if (p.length === 2) return [`py-[${p[0]}]`, `px-[${p[1]}]`];
  if (p.length === 3) return [`pt-[${p[0]}]`, `px-[${p[1]}]`, `pb-[${p[2]}]`];
  return [`pt-[${p[0]}]`, `pr-[${p[1]}]`, `pb-[${p[2]}]`, `pl-[${p[3]}]`];
}

/** `1px solid #fff` → width, style and colour classes (`border-…` or `outline-…`). */
function line(prefix: "border" | "outline", value: string): string[] | null {
  const parts = splitTopLevel(value, " ");
  if (parts.length < 3) return null;
  const [width, style, ...rest] = parts;
  const colour = rest.join(" ");
  const out: string[] = [];
  out.push(prefix === "border" && width === "1px" ? "border" : withHint(prefix, width, "length"));
  out.push(`${prefix}-${style}`);
  out.push(withHint(prefix, colour, "color"));
  return out;
}

export function tailwindFor(style: string): TailwindResult {
  const classes: string[] = [];
  const inline: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const prop = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (!prop || !value) continue;

    const keyword = KEYWORDS[prop]?.[value];
    if (keyword) {
      classes.push(keyword);
      continue;
    }
    if (SIMPLE[prop]) {
      classes.push(`${SIMPLE[prop]}-[${arbitrary(value)}]`);
      continue;
    }

    switch (prop) {
      case "padding":
        classes.push(...padding(value));
        break;
      case "background":
        // Several paint layers, or a layer that is an image, have no single class.
        if (splitTopLevel(value, ",").length > 1 || value.includes("image(")) {
          inline.background = value;
        } else {
          classes.push(`bg-[${arbitrary(value)}]`);
        }
        break;
      case "color":
        classes.push(withHint("text", value, "color"));
        break;
      case "font-size":
        classes.push(withHint("text", value, "length"));
        break;
      case "font-family":
        classes.push(withHint("font", value, "family-name"));
        break;
      case "font-weight":
        classes.push(WEIGHT_NAMES[value] ?? withHint("font", value, "weight"));
        break;
      case "border":
      case "outline": {
        const parts = line(prop, value);
        if (parts) classes.push(...parts);
        else classes.push(`[${prop}:${arbitrary(value)}]`);
        break;
      }
      case "fill":
        classes.push(`fill-[${arbitrary(value)}]`);
        break;
      case "stroke":
        classes.push(withHint("stroke", value, "color"));
        break;
      case "stroke-width":
        classes.push(withHint("stroke", value, "length"));
        break;
      case "transform": {
        const rotate = /^rotate\((.+)\)$/.exec(value);
        classes.push(
          rotate ? `rotate-[${arbitrary(rotate[1])}]` : `[transform:${arbitrary(value)}]`,
        );
        break;
      }
      case "filter": {
        const blur = /^blur\((.+)\)$/.exec(value);
        classes.push(blur ? `blur-[${arbitrary(blur[1])}]` : `[filter:${arbitrary(value)}]`);
        break;
      }
      case "backdrop-filter": {
        const blur = /^blur\((.+)\)$/.exec(value);
        classes.push(
          blur ? `backdrop-blur-[${arbitrary(blur[1])}]` : `[backdrop-filter:${arbitrary(value)}]`,
        );
        break;
      }
      case "mix-blend-mode":
        classes.push(`mix-blend-${value}`);
        break;
      default:
        classes.push(`[${prop}:${arbitrary(value)}]`);
    }
  }
  return { classes, inline };
}
