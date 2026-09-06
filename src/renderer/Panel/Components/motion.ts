/**
 * motion — the panel's open/close transitions, timed like the desktop it
 * imitates.
 *
 * Durations and easing are not hardcoded here: each frame publishes them as
 * `--motion-open` / `--motion-ease` on `#panel` (theme.css), so the GNOME frame
 * moves like libadwaita's AdwTabBar (200 ms, ease-out-cubic) and the Breeze
 * frame like Plasma (150 ms). `prefers-reduced-motion` zeroes both tokens —
 * Chromium derives that media query from GTK's `gtk-enable-animations`, so
 * turning animations off in GNOME Tweaks / System Settings turns these off too.
 */

import type { TransitionConfig } from "svelte/transition";

const DEFAULT_OPEN_MS = 200;

const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `--motion-open` in ms as the frame defines it on #panel; 0 under reduced motion. */
export function openDuration(): number {
  if (reducedMotion()) return 0;
  const panel = document.getElementById("panel");
  if (!panel) return DEFAULT_OPEN_MS;
  const raw = getComputedStyle(panel).getPropertyValue("--motion-open").trim();
  const ms = raw.endsWith("ms") ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000;
  return Number.isFinite(ms) ? ms : DEFAULT_OPEN_MS;
}

/** ease-out-cubic — libadwaita's ADW_EASE_OUT_CUBIC, also what Plasma uses for reveal/hide. */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * A tab (or strip button) growing out of nothing / shrinking to nothing: the
 * width unfolds from 0 to its natural size while it fades in, and the same in
 * reverse on close — AdwTabBar's open/close animation. Neighbours slide along
 * because the collapsing width is real layout, not a transform. The parent's
 * column gap is folded into a negative margin so the row does not jump by one
 * gap when the element finally disappears.
 */
export function tabSlide(node: HTMLElement): TransitionConfig {
  const duration = openDuration();
  const width = node.getBoundingClientRect().width;
  const gap = node.parentElement
    ? Number.parseFloat(getComputedStyle(node.parentElement).columnGap) || 0
    : 0;

  return {
    duration,
    easing: easeOutCubic,
    css: (t, u) =>
      [
        "overflow: hidden",
        "min-width: 0",
        "flex-shrink: 0",
        "pointer-events: none",
        `max-width: ${(t * width).toFixed(2)}px`,
        `margin-right: ${(-gap * u).toFixed(2)}px`,
        `opacity: ${t.toFixed(3)}`,
      ].join("; "),
  };
}
