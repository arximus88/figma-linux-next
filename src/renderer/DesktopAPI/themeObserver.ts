import { sendMsgToMain } from "Utils/Render/webBindingsHelpers";

/**
 * Reports the colour scheme Figma is *actually painting*.
 *
 * Figma only calls `setThemePreference` when the user touches the Theme menu,
 * so a stored preference goes stale: pick "System theme" once, flip the OS to
 * light a week later, and the panel would stay dark. Measuring the page's
 * background luminance instead follows whatever Figma renders, whatever the
 * reason, and needs no knowledge of Figma's DOM.
 */

type Theme = "dark" | "light";

const parseRgb = (value: string): [number, number, number, number] | null => {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
};

const opaqueBackground = (el: Element | null): [number, number, number] | null => {
  if (!el) return null;
  const rgb = parseRgb(getComputedStyle(el).backgroundColor);
  return rgb && rgb[3] > 0.5 ? [rgb[0], rgb[1], rgb[2]] : null;
};

/**
 * Background of <body>, then <html>, then the first few levels of app root
 * elements (Figma paints its shell on a wrapper div, not on <body>). Null while
 * everything is still transparent/unset, e.g. on the login page.
 */
const pageBackground = (): [number, number, number] | null => {
  const direct = opaqueBackground(document.body) ?? opaqueBackground(document.documentElement);
  if (direct) return direct;

  let el: Element | null = document.body?.firstElementChild ?? null;
  for (let depth = 0; el && depth < 4; depth++) {
    const bg = opaqueBackground(el);
    if (bg) return bg;
    el = el.firstElementChild;
  }
  return null;
};

const themeOf = ([r, g, b]: [number, number, number]): Theme =>
  0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? "dark" : "light";

/**
 * What Figma is painting right now. Figma stamps the resolved choice on <body>
 * (`data-preferred-theme="light|dark"`, `style="color-scheme: light"`) — "System
 * theme" is already resolved there. The background-luminance walk is the
 * fallback for pages that carry neither marker.
 */
const currentTheme = (): Theme | null => {
  const body = document.body;
  if (body) {
    const stamped = body.dataset.preferredTheme;
    if (stamped === "dark" || stamped === "light") return stamped;
    const scheme = getComputedStyle(body).colorScheme;
    if (scheme === "dark" || scheme === "light") return scheme;
  }
  const bg = pageBackground();
  return bg ? themeOf(bg) : null;
};

export function observeFigmaTheme(): void {
  let last: Theme | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const report = () => {
    const theme = currentTheme();
    if (!theme || theme === last) return;
    last = theme;
    sendMsgToMain("figmaThemeObserved", theme);
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(report, 150);
  };

  const start = () => {
    report();
    // Figma switches theme by toggling attributes on <html>/<body>.
    const observer = new MutationObserver(schedule);
    for (const el of [document.documentElement, document.body]) {
      if (el) observer.observe(el, { attributes: true });
    }
    // Late style application (fonts, lazily loaded CSS) — a few cheap re-checks.
    for (const delay of [500, 2000, 5000]) setTimeout(report, delay);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  window.addEventListener("load", report, { once: true });
}
