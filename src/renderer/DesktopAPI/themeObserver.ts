import { sendMsgToMain } from "Utils/Render/webBindingsHelpers";

/**
 * Reports the colour scheme Figma is *actually painting*.
 *
 * Figma only calls `setThemePreference` when the user touches the Theme menu,
 * so a stored preference goes stale: pick "System theme" once, flip the OS to
 * light a week later, and the panel would stay dark. Reading the scheme Figma
 * stamps on <body> instead follows whatever Figma renders, whatever the reason.
 */

type Theme = "dark" | "light";

/**
 * What Figma is painting right now. Figma stamps the resolved choice on <body>
 * (`data-preferred-theme="light|dark"`, `style="color-scheme: light"`) — "System
 * theme" is already resolved there. Pages without the stamp (the login page,
 * error pages) report nothing: they are always light and would otherwise
 * overwrite the stored preference with "light" on every fresh start.
 */
const currentTheme = (): Theme | null => {
  const body = document.body;
  if (!body) return null;
  const stamped = body.dataset.preferredTheme;
  if (stamped === "dark" || stamped === "light") return stamped;
  const scheme = getComputedStyle(body).colorScheme;
  if (scheme === "dark" || scheme === "light") return scheme;
  return null;
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
