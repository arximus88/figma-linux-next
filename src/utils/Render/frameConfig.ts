/**
 * Frame Config Registry
 * Maps each FrameStyle to its specific icon components, sizes, and behaviors.
 * Components import getFrameConfig() and render dynamically — no branching.
 */
import type { Component } from "svelte";

import { Figma, Community, Plus, Corner, Minimize, Maximize, Close } from "Icons";
import {
  GnomeFigma,
  GnomeMenu,
  GnomePlus,
  GnomeMinimize,
  GnomeMaximize,
  GnomeClose,
  GnomeTabClose,
} from "Icons";

export interface FrameIconConfig {
  component: Component<any>;
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
    menu: { component: GnomeMenu, size: "24" },
    minimize: { component: GnomeMinimize, size: "24" },
    maximize: { component: GnomeMaximize, size: "24" },
    close: { component: GnomeClose, size: "24" },
  },
  tabs: {
    closeIcon: { component: GnomeTabClose, size: "16" },
    showDividers: true,
  },
};

// TBD: macOS config — uses Windows icons as placeholder
const MACOS_CONFIG: FrameConfig = { ...WINDOWS_CONFIG };

// TBD: KDE config — uses Windows icons as placeholder
const KDE_CONFIG: FrameConfig = { ...WINDOWS_CONFIG };

const FRAME_CONFIGS: Record<Types.FrameStyle, FrameConfig> = {
  windows: WINDOWS_CONFIG,
  gnome: GNOME_CONFIG,
  macos: MACOS_CONFIG,
  kde: KDE_CONFIG,
};

/**
 * Get the icon/component configuration for a frame style
 */
export function getFrameConfig(style: Types.FrameStyle): FrameConfig {
  return FRAME_CONFIGS[style] ?? WINDOWS_CONFIG;
}
