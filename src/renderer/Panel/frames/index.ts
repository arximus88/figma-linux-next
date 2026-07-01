/**
 * Frame helpers. A single FramedPanel renders every style (see
 * FramedPanel.svelte, configured by its `style` prop), so there is no longer a
 * per-style Panel component to resolve. These exports describe which styles are
 * valid / available for the Settings UI.
 * To add a new OS style: add its config to frameTheme.ts and enable it here.
 */

export const VALID_FRAME_STYLES = new Set<Types.FrameStyle>(["windows", "gnome", "macos", "kde"]);
export const IMPLEMENTED_FRAME_STYLES = new Set<Types.FrameStyle>(["gnome", "windows"]);

export function isValidFrameStyle(style: unknown): style is Types.FrameStyle {
  return typeof style === "string" && VALID_FRAME_STYLES.has(style as Types.FrameStyle);
}

export function getAvailableFrameStyles(): Array<{
  value: Types.FrameStyle;
  label: string;
  disabled?: boolean;
}> {
  return [
    { value: "gnome", label: "GNOME / Adwaita" },
    { value: "windows", label: "Windows 11" },
    { value: "macos", label: "macOS (Coming Soon)", disabled: true },
    { value: "kde", label: "KDE Plasma (Coming Soon)", disabled: true },
  ];
}
