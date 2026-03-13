/**
 * Frame resolver — maps a FrameStyle string to the correct Panel component.
 * Each frame is a self-contained Svelte component directory.
 * To add a new OS style: create a new directory and add it here.
 */
export { default as GnomePanel } from "./GnomeFrame/Panel.svelte";
export { default as WindowsPanel } from "./WindowsFrame/Panel.svelte";

import type { Component } from "svelte";

import GnomePanel from "./GnomeFrame/Panel.svelte";
import WindowsPanel from "./WindowsFrame/Panel.svelte";

const FRAME_MAP: Partial<Record<Types.FrameStyle, Component<{ zoom?: number }>>> = {
  gnome: GnomePanel,
  windows: WindowsPanel,
  // macos: MacOSPanel,   ← add when ready
  // kde: KDEPanel,       ← add when ready
};

/**
 * Returns the Panel component for the given frame style.
 * Falls back to GnomePanel if the style is unknown/unimplemented.
 */
export function getFramePanel(style: Types.FrameStyle): Component<{ zoom?: number }> {
  return FRAME_MAP[style] ?? GnomePanel;
}

export const VALID_FRAME_STYLES = new Set<Types.FrameStyle>(["windows", "gnome", "macos", "kde"]);
export const IMPLEMENTED_FRAME_STYLES = new Set<Types.FrameStyle>(Object.keys(FRAME_MAP) as Types.FrameStyle[]);

export function isValidFrameStyle(style: any): style is Types.FrameStyle {
  return typeof style === "string" && VALID_FRAME_STYLES.has(style as Types.FrameStyle);
}

export function getAvailableFrameStyles(): Array<{ value: Types.FrameStyle; label: string; disabled?: boolean }> {
  return [
    { value: "gnome",   label: "GNOME / Adwaita" },
    { value: "windows", label: "Windows 11" },
    { value: "macos",   label: "macOS (Coming Soon)",      disabled: true },
    { value: "kde",     label: "KDE Plasma (Coming Soon)", disabled: true },
  ];
}
