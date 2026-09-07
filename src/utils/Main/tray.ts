/**
 * Label of the first tray entry. "Show" raises (and un-minimises) an existing
 * window; once the last window is closed with the tray keeping the process
 * alive, the same entry opens a new one.
 */
export function trayShowLabel(hasWindows: boolean): string {
  return hasWindows ? "Show Figma" : "Open Figma";
}
