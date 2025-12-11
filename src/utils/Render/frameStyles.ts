/**
 * Frame Style Definitions
 * Provides CSS variables for different window frame styles: Windows, Gnome/Adwaita, and macOS
 */

export interface FrameStyleVars {
  // Panel/Header
  '--panel-height': string;
  '--panel-bg': string;
  '--panel-border-bottom': string;

  // Window controls
  '--window-control-size': string;
  '--window-control-spacing': string;
  '--window-control-radius': string;
  '--window-control-hover-bg': string;
  '--window-control-active-bg': string;
  '--window-close-hover-bg': string;
  '--window-close-hover-fg': string;

  // Tabs
  '--tab-height': string;
  '--tab-radius': string;
  '--tab-padding': string;
  '--tab-spacing': string;
  '--tab-border': string;

  // Icons
  '--icon-stroke-width': string;
}

export const FRAME_STYLES: Record<Types.FrameStyle, FrameStyleVars> = {
  windows: {
    // Windows 11 style - square, minimal
    '--panel-height': '40px',
    '--panel-bg': 'var(--bg-header)',
    '--panel-border-bottom': 'none',

    '--window-control-size': '40px',
    '--window-control-spacing': '0px',
    '--window-control-radius': '0px',
    '--window-control-hover-bg': 'rgba(255, 255, 255, 0.1)',
    '--window-control-active-bg': 'rgba(255, 255, 255, 0.15)',
    '--window-close-hover-bg': '#c42b1c',
    '--window-close-hover-fg': '#ffffff',

    '--tab-height': '40px',
    '--tab-radius': '0px',
    '--tab-padding': '0 16px',
    '--tab-spacing': '0px',
    '--tab-border': 'none',

    '--icon-stroke-width': '1.5px',
  },

  gnome: {
    // GNOME/Adwaita style - rounded, modern
    '--panel-height': '40px',
    '--panel-bg': 'var(--bg-header)',
    '--panel-border-bottom': '1px solid rgba(0, 0, 0, 0.1)',

    '--window-control-size': '36px',
    '--window-control-spacing': '4px',
    '--window-control-radius': '8px',
    '--window-control-hover-bg': 'rgba(255, 255, 255, 0.08)',
    '--window-control-active-bg': 'rgba(255, 255, 255, 0.12)',
    '--window-close-hover-bg': '#c01c28',
    '--window-close-hover-fg': '#ffffff',

    '--tab-height': '36px',
    '--tab-radius': '8px',
    '--tab-padding': '0 14px',
    '--tab-spacing': '4px',
    '--tab-border': 'none',

    '--icon-stroke-width': '2px',
  },

  macos: {
    // macOS style - traffic lights, subtle
    '--panel-height': '38px',
    '--panel-bg': 'var(--bg-header)',
    '--panel-border-bottom': '1px solid rgba(0, 0, 0, 0.08)',

    '--window-control-size': '12px',
    '--window-control-spacing': '8px',
    '--window-control-radius': '50%',
    '--window-control-hover-bg': 'transparent',
    '--window-control-active-bg': 'transparent',
    '--window-close-hover-bg': '#ff5f56',
    '--window-close-hover-fg': 'rgba(0, 0, 0, 0.5)',

    '--tab-height': '32px',
    '--tab-radius': '6px',
    '--tab-padding': '0 12px',
    '--tab-spacing': '2px',
    '--tab-border': '1px solid rgba(0, 0, 0, 0.05)',

    '--icon-stroke-width': '1.5px',
  },
};

/**
 * Get CSS variable declarations for a frame style
 */
export function getFrameStyleVars(style: Types.FrameStyle): string {
  const vars = FRAME_STYLES[style];
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

/**
 * Get frame style display name
 */
export function getFrameStyleName(style: Types.FrameStyle): string {
  const names: Record<Types.FrameStyle, string> = {
    windows: 'Windows 11',
    gnome: 'GNOME / Adwaita',
    macos: 'macOS',
  };
  return names[style];
}

/**
 * Get all available frame styles
 */
export function getAvailableFrameStyles(): Array<{ value: Types.FrameStyle; label: string }> {
  return [
    { value: 'windows', label: 'Windows 11' },
    { value: 'gnome', label: 'GNOME / Adwaita' },
    { value: 'macos', label: 'macOS' },
  ];
}
