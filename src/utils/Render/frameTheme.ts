import type { Component } from "svelte";
import { Figma, FigmaColored, Community, Plus, Corner, Minimize, Maximize, Close } from "Icons";
import {
  GnomeFigma,
  GnomeMenu,
  GnomePlus,
  GnomeMinimize,
  GnomeMaximize,
  GnomeClose,
  GnomeTabClose,
} from "Icons";
import { BreezeClose, BreezeMaximize, BreezeMenu, BreezeMinimize } from "Icons";

// ============================================================================
// Types
// ============================================================================

export interface FrameIconConfig {
  component: Component<Record<string, unknown>>;
  size: string;
}

export interface FrameConfig {
  left: {
    home: FrameIconConfig;
    community: FrameIconConfig; // Community/explore button
    plus: FrameIconConfig;
  };
  right: {
    menu: FrameIconConfig | null; // Windows has Corner menu, Gnome has none
    minimize: FrameIconConfig;
    maximize: FrameIconConfig;
    close: FrameIconConfig;
  };
  tabs: {
    closeIcon: FrameIconConfig;
    showDividers: boolean;
  };
}

// ============================================================================
// Frame Configs
// ============================================================================

const WINDOWS_CONFIG: FrameConfig = {
  left: {
    home: { component: Figma, size: "22" },
    community: { component: Community, size: "20" },
    plus: { component: Plus, size: "15" },
  },
  right: {
    menu: { component: Corner, size: "14" },
    minimize: { component: Minimize, size: "16" },
    maximize: { component: Maximize, size: "16" },
    close: { component: Close, size: "16" },
  },
  tabs: {
    closeIcon: { component: Close, size: "14" },
    showDividers: false,
  },
};

const GNOME_CONFIG: FrameConfig = {
  left: {
    home: { component: GnomeFigma, size: "16" },
    community: { component: Community, size: "16" },
    plus: { component: GnomePlus, size: "16" },
  },
  right: {
    // Matches the rendered GnomeFrame menu button (was stale at "24").
    menu: { component: GnomeMenu, size: "16" },
    minimize: { component: GnomeMinimize, size: "24" },
    maximize: { component: GnomeMaximize, size: "24" },
    close: { component: GnomeClose, size: "24" },
  },
  tabs: {
    closeIcon: { component: GnomeTabClose, size: "24" },
    showDividers: true,
  },
};

// TBD: macOS config — uses Windows icons as placeholder
const MACOS_CONFIG: FrameConfig = { ...WINDOWS_CONFIG };

// KDE Plasma / Breeze — glyphs from breeze-icons (LGPL), see Icons/Breeze*.svelte.
const KDE_CONFIG: FrameConfig = {
  left: {
    // Breeze app icons are full-colour, so the home button carries the brand mark.
    home: { component: FigmaColored, size: "20" },
    community: { component: Community, size: "18" },
    plus: { component: Plus, size: "16" },
  },
  right: {
    menu: { component: BreezeMenu, size: "18" },
    minimize: { component: BreezeMinimize, size: "18" },
    maximize: { component: BreezeMaximize, size: "18" },
    close: { component: BreezeClose, size: "18" },
  },
  tabs: {
    closeIcon: { component: BreezeClose, size: "14" },
    showDividers: false,
  },
};

const FRAME_CONFIGS: Record<Types.FrameStyle, FrameConfig> = {
  windows: WINDOWS_CONFIG,
  gnome: GNOME_CONFIG,
  macos: MACOS_CONFIG,
  kde: KDE_CONFIG,
};

// ============================================================================
// Helpers
// ============================================================================

const VALID_STYLES = new Set<Types.FrameStyle>(["windows", "gnome", "macos", "kde"]);

/**
 * Type guard for FrameStyle
 */
export function isValidFrameStyle(style: unknown): style is Types.FrameStyle {
  return typeof style === "string" && VALID_STYLES.has(style as Types.FrameStyle);
}

/**
 * Get the icon/component configuration for a frame style
 */
export function getFrameConfig(style: Types.FrameStyle): FrameConfig {
  return FRAME_CONFIGS[style] ?? WINDOWS_CONFIG;
}
