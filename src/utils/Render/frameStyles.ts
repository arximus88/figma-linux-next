/**
 * Frame Style Definitions
 * Provides CSS variables for different window frame styles: Windows, Gnome/Adwaita
 * Each style must define ALL variables to prevent bleed between styles.
 */

export interface FrameStyleVars {
  // Panel/Header
  "--panel-height": string;
  "--panel-bg": string;
  "--panel-border-bottom": string;
  "--panel-padding": string;
  "--panel-gap": string;
  "--panel-align-items": string;
  "--panel-border-radius": string;
  "--panel-box-shadow": string;

  // Left section
  "--left-btn-padding": string;
  "--left-btn-size": string;
  "--left-gap": string;

  // Window controls
  "--window-control-size": string;
  "--window-control-spacing": string;
  "--window-control-radius": string;
  "--window-control-hover-bg": string;
  "--window-control-active-bg": string;
  "--window-control-padding-right": string;
  "--window-close-hover-bg": string;
  "--window-close-hover-fg": string;

  // Tabs
  "--tab-height": string;
  "--tab-radius": string;
  "--tab-padding": string;
  "--tab-spacing": string;
  "--tab-border": string;
  "--tab-active-bg": string;
  "--tab-close-padding": string;
  "--tab-close-bg": string;
  "--tab-close-radius": string;
  "--tab-divider-width": string;
  "--tab-divider-height": string;
  "--tab-divider-color": string;
  "--tab-divider-active-color": string;
  "--tab-margin": string;
  "--tab-text-padding": string;

  // Icons
  "--icon-stroke-width": string;
}

export const FRAME_STYLES: Record<Types.FrameStyle, FrameStyleVars> = {
  windows: {
    // Windows 11 style — square controls, flush edges, no padding
    "--panel-height": "40px",
    "--panel-bg": "var(--bg-header)",
    "--panel-border-bottom": "none",
    "--panel-padding": "0",
    "--panel-gap": "0px",
    "--panel-align-items": "stretch",
    "--panel-border-radius": "0",
    "--panel-box-shadow": "none",

    "--left-btn-padding": "0 10px",
    "--left-btn-size": "auto",
    "--left-gap": "0px",

    "--window-control-size": "40px",
    "--window-control-spacing": "0px",
    "--window-control-radius": "0px",
    "--window-control-hover-bg": "rgba(255, 255, 255, 0.1)",
    "--window-control-active-bg": "rgba(255, 255, 255, 0.15)",
    "--window-control-padding-right": "0px",
    "--window-close-hover-bg": "#c42b1c",
    "--window-close-hover-fg": "#ffffff",

    "--tab-height": "40px",
    "--tab-radius": "0px",
    "--tab-padding": "0 16px",
    "--tab-spacing": "0px",
    "--tab-border": "none",
    "--tab-active-bg": "var(--bg-tab-hover)",
    "--tab-close-padding": "0 7px",
    "--tab-close-bg": "transparent",
    "--tab-close-radius": "0px",
    "--tab-divider-width": "0px",
    "--tab-divider-height": "0px",
    "--tab-divider-color": "transparent",
    "--tab-divider-active-color": "transparent",
    "--tab-margin": "0 0 0 2px",
    "--tab-text-padding": "0 0 0 12px",

    "--icon-stroke-width": "1.5px",
  },

  gnome: {
    // GNOME/Adwaita style — rounded, padded, matching prototype reference
    "--panel-height": "46px",
    "--panel-bg": "#2e2e32",
    "--panel-border-bottom": "1px solid rgba(0, 0, 0, 0.24)",
    "--panel-padding": "0 9px",
    "--panel-gap": "12px",
    "--panel-align-items": "center",
    "--panel-border-radius": "12px 12px 0 0",
    "--panel-box-shadow": "0px 1px 2px 0px rgba(0, 0, 0, 0.24)",

    "--left-btn-padding": "0",
    "--left-btn-size": "34px",
    "--left-gap": "4px",

    "--window-control-size": "24px",
    "--window-control-spacing": "12px",
    "--window-control-radius": "20px",
    "--window-control-hover-bg": "rgba(255, 255, 255, 0.08)",
    "--window-control-active-bg": "rgba(255, 255, 255, 0.12)",
    "--window-control-padding-right": "0px",
    "--window-close-hover-bg": "#c01c28",
    "--window-close-hover-fg": "#ffffff",

    "--tab-height": "34px",
    "--tab-radius": "8px",
    "--tab-padding": "0",
    "--tab-spacing": "2px",
    "--tab-border": "none",
    "--tab-active-bg": "#3d3d40",
    "--tab-close-padding": "0",
    "--tab-close-bg": "rgba(255, 255, 255, 0.06)",
    "--tab-close-radius": "20px",
    "--tab-divider-width": "1px",
    "--tab-divider-height": "28px",
    "--tab-divider-color": "#4f4f4f",
    "--tab-divider-active-color": "transparent",
    "--tab-margin": "0",
    "--tab-text-padding": "0 0 0 14px",

    "--icon-stroke-width": "2px",
  },

  // Placeholder: macOS uses Windows style as base (not yet implemented)
  macos: undefined as unknown as FrameStyleVars,
  // Placeholder: KDE uses Windows style as base (not yet implemented)
  kde: undefined as unknown as FrameStyleVars,
};

// Fill placeholders with Windows style as fallback
FRAME_STYLES.macos = { ...FRAME_STYLES.windows };
FRAME_STYLES.kde = { ...FRAME_STYLES.windows };

/**
 * Get CSS variable declarations for a frame style
 */
export function getFrameStyleVars(style: Types.FrameStyle): string {
  const vars = FRAME_STYLES[style] ?? FRAME_STYLES.gnome;
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

/**
 * Get frame style display name
 */
export function getFrameStyleName(style: Types.FrameStyle): string {
  const names: Record<string, string> = {
    windows: "Windows 11",
    gnome: "GNOME / Adwaita",
  };
  return names[style] ?? "Unknown";
}

/**
 * Get all available frame styles (only functional ones)
 */
export function getAvailableFrameStyles(): Array<{ value: Types.FrameStyle; label: string }> {
  return [
    { value: "windows", label: "Windows 11" },
    { value: "gnome", label: "GNOME / Adwaita" },
  ];
}
