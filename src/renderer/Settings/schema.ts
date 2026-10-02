/**
 * Every row of the Settings UI, in one place: the section it lives in, the
 * title and help text it shows, and the extra words search should match.
 *
 * Rows render their text from here (SettingRow `setting={SETTINGS.x}`), so
 * search can never point at a title the UI no longer shows. Adding a setting:
 * an entry here, the row in its section view, and — if it is user-editable —
 * the key in Utils/Common/settingsEdit.
 */

export type SectionId = "general" | "appearance" | "tabs" | "integrations" | "advanced";

export interface SectionMeta {
  id: SectionId;
  title: string;
  description: string;
}

export const SECTIONS: SectionMeta[] = [
  {
    id: "general",
    title: "General",
    description: "How the app starts, where files go, and how it fits your desktop.",
  },
  {
    id: "appearance",
    title: "Appearance",
    description: "Interface size and colour rendering.",
  },
  {
    id: "tabs",
    title: "Tabs & windows",
    description: "The window frame and the tab strip.",
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Give AI tools the open file's design context, or the live app window.",
  },
  {
    id: "advanced",
    title: "Advanced",
    description: "Local font folders and Chromium launch switches.",
  },
];

export interface SettingMeta {
  id: string;
  section: SectionId;
  title: string;
  subtitle?: string;
  /** Words a user might search for that are not in the title or help. */
  keywords?: string;
}

function setting(meta: SettingMeta): SettingMeta {
  return meta;
}

export const SETTINGS = {
  restoreTabs: setting({
    id: "restore-tabs",
    section: "general",
    title: "Restore open tabs on startup",
    subtitle: "Reopen the Figma files you had open when you quit.",
    keywords: "save last opened tabs session",
  }),
  exportDir: setting({
    id: "export-dir",
    section: "general",
    title: "Export files to",
    keywords: "folder directory download save path",
  }),
  tray: setting({
    id: "tray",
    section: "general",
    title: "Keep running in the system tray",
    subtitle:
      "Closing the last window leaves the app in the tray. Works on KDE Plasma, and on GNOME with the AppIndicator extension.",
    keywords: "tray icon background status notifier appindicator",
  }),
  zenity: setting({
    id: "zenity",
    section: "general",
    title: "Use GTK file dialogs",
    subtitle: "Open and save files with Zenity instead of Electron's dialogs.",
    keywords: "zenity dialog file picker",
  }),
  scaleFigmaUi: setting({
    id: "scale-figma-ui",
    section: "appearance",
    title: "Figma interface",
    subtitle: "Zoom Figma's UI and canvas chrome. Your document is unchanged.",
    keywords: "scale zoom size ui dpi",
  }),
  scalePanel: setting({
    id: "scale-panel",
    section: "appearance",
    title: "Tabs & app chrome",
    subtitle: "Size of the tab strip and window controls around Figma.",
    keywords: "scale zoom size tabs panel header",
  }),
  srgb: setting({
    id: "srgb",
    section: "appearance",
    title: "Use sRGB color space",
    subtitle: "Fixes washed-out colours on wide-gamut displays.",
    keywords: "color colour gamut washed out profile",
  }),
  webgpu: setting({
    id: "webgpu",
    section: "appearance",
    title: "WebGPU shaders",
    subtitle: "Shader, Halftone and Noise effects. Runs the app under XWayland.",
    keywords: "gpu shader effects halftone noise xwayland vulkan",
  }),
  frameAuto: setting({
    id: "frame-auto",
    section: "tabs",
    title: "Match the desktop environment",
    keywords: "frame style automatic detect gnome kde",
  }),
  frameStyle: setting({
    id: "frame-style",
    section: "tabs",
    title: "Window frame style",
    keywords: "frame titlebar header adwaita breeze windows legacy",
  }),
  hideMinMax: setting({
    id: "hide-min-max",
    section: "tabs",
    title: "Show only the close button",
    subtitle: "Hide minimize and maximize, like stock GNOME.",
    keywords: "minimize maximize window buttons controls",
  }),
  newTabAfterTabs: setting({
    id: "new-tab-after-tabs",
    section: "tabs",
    title: "New tab button after the tabs",
    subtitle: "Put the + at the end of the tab strip, like Figma's own desktop app.",
    keywords: "plus new file button position",
  }),
  tabPreviews: setting({
    id: "tab-previews",
    section: "tabs",
    title: "Tab previews on hover",
    subtitle: "Rest the pointer on a tab to see its thumbnail and last edit.",
    keywords: "hover card thumbnail preview",
  }),
  duplicateFileTabs: setting({
    id: "duplicate-file-tabs",
    section: "tabs",
    title: "Open a file in more than one tab",
    subtitle:
      "Opening a file that is already open starts a new tab instead of switching to it, so two of its pages can stay a click apart.",
    keywords: "duplicate same file twice multiple tabs pages",
  }),
  mcpServer: setting({
    id: "mcp-server",
    section: "integrations",
    title: "Figma MCP",
    subtitle: "Serve the open file's design context to AI assistants over local HTTP.",
    keywords: "mcp ai claude assistant server design context",
  }),
  mcpWrite: setting({
    id: "mcp-write",
    section: "integrations",
    title: "Allow editing tools",
    subtitle: "Let AI create, edit and delete nodes. Reading is always available.",
    keywords: "mcp write tools edit",
  }),
  mcpPort: setting({
    id: "mcp-port",
    section: "integrations",
    title: "Server port",
    subtitle: "Default 3845. Binds to 127.0.0.1 only.",
    keywords: "mcp port http",
  }),
  cdp: setting({
    id: "cdp",
    section: "integrations",
    title: "Chrome DevTools",
    subtitle: "Let AI tools drive and inspect the live app window.",
    keywords: "cdp devtools debugging remote chrome mcp automation",
  }),
  cdpPort: setting({
    id: "cdp-port",
    section: "integrations",
    title: "Debugging port",
    subtitle: "127.0.0.1 only. Any local process can attach while it is open.",
    keywords: "cdp port remote debugging",
  }),
  fontDirs: setting({
    id: "font-dirs",
    section: "advanced",
    title: "Font directories",
    subtitle: "Folders scanned for local fonts, in addition to the system ones.",
    keywords: "fonts local folders",
  }),
  commandSwitches: setting({
    id: "command-switches",
    section: "advanced",
    title: "Chromium command line switches",
    subtitle: "For troubleshooting. A wrong switch can stop the app from starting.",
    keywords: "chromium flags switches command line",
  }),
} satisfies Record<string, SettingMeta>;

const ALL: SettingMeta[] = Object.values(SETTINGS);

/**
 * Settings matching a query, in UI order. Every word of the query has to
 * start some word of the title, help text, keywords or section name — so
 * "port" finds the two port fields, not "Export files to".
 */
export function searchSettings(query: string): SettingMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return ALL.filter((s) => {
    const section = SECTIONS.find((sec) => sec.id === s.section)?.title ?? "";
    const vocabulary = [s.title, s.subtitle, s.keywords, section]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter(Boolean);
    return words.every((w) => vocabulary.some((v) => v.startsWith(w)));
  });
}
