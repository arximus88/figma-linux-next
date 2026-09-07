/**
 * Frame helpers. A single FramedPanel renders every style (see
 * FramedPanel.svelte, configured by its `style` prop), so there is no longer a
 * per-style Panel component to resolve. These exports describe which styles are
 * available for the Settings UI; the validity guard lives with the configs in
 * Utils/Render/frameTheme.ts. To add a new OS style: add its config there and
 * enable it here.
 */

export { isValidFrameStyle } from "Utils/Render/frameTheme";

/** Label for a style value, e.g. for the "Detected: …" hint in Settings. */
export function getFrameStyleLabel(style: Types.FrameStyle): string {
  return getAvailableFrameStyles().find((s) => s.value === style)?.label ?? style;
}

export function getAvailableFrameStyles(): Array<{
  value: Types.FrameStyle;
  label: string;
  disabled?: boolean;
}> {
  return [
    { value: "gnome", label: "GNOME / Adwaita" },
    { value: "kde", label: "KDE Plasma / Breeze" },
    { value: "windows", label: "Legacy Windows" },
    { value: "macos", label: "macOS (Coming Soon)", disabled: true },
  ];
}
