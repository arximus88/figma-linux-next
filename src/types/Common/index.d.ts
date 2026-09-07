declare namespace Types {
  type EditorType = "design" | "figjam" | "slides" | "buzz" | "site" | "make" | "prototype";

  /** Runtime state of the MCP integrations, reported to the settings UI. */
  interface McpStatus {
    /** The built-in Figma MCP HTTP server. */
    server: { listening: boolean; port: number };
    /** The Chrome DevTools Protocol port actually opened at launch (null if off). */
    cdp: { active: boolean; port: number | null };
  }

  interface Tab {
    id: number;
    title?: string;
    url?: string;
    moves?: boolean;
    fileKey?: string;
    editorType?: EditorType;
    isLibrary?: boolean;
    order?: number;
    focused?: boolean;
    isUsingMicrophone?: boolean;
    isInVoiceCall?: boolean;
    loading?: boolean;
    view: import("electron").WebContentsView;
  }

  type TabIdType = number | "mainTab" | "communityTab";
  type TabFront = Pick<
    Tab,
    | "id"
    | "title"
    | "url"
    | "editorType"
    | "isLibrary"
    | "order"
    | "isUsingMicrophone"
    | "isInVoiceCall"
    | "loading"
  >;

  interface AddTabProps {
    id: number;
    url: string;
    title?: string;
    focused?: boolean;
    order?: number;
    editorType?: EditorType;
    isLibrary?: boolean;
    loading?: boolean;
  }

  interface TabData {
    micAccess: boolean;
    view: import("electron").WebContentsView;
  }

  interface WindowInitOpts {
    userId?: string;
    tabs?: Types.SavedTab[];
  }

  interface SavedTab {
    title?: string;
    url?: string;
  }

  interface ShortcutsMap {
    accelerator: string;
    value: string;
    type: "action" | "command" | "id";
  }

  type View = "TopPanel" | "Settings" | "ThemeCreator";
  type SettingsView = "General" | "Themes";
  type FrameStyle = "windows" | "gnome" | "macos" | "kde";
  type ResolvedTheme = "dark" | "light";
  /** What Figma reports from its Theme menu; "system" follows the OS. */
  type FigmaThemePreference = ResolvedTheme | "system";
  /** What main sends the tab hover card (Main/Ui/TabPreviewView → renderer/Preview). */
  interface TabPreviewPayload {
    id: number;
    title: string;
    /** Trimmed for display: host + path, no scheme or query. */
    url: string;
    editorType?: EditorType;
    isLibrary?: boolean;
    /** JPEG data URL captured when the tab lost focus; null for the active tab or before any capture. */
    image: string | null;
    active: boolean;
    frame: FrameStyle;
    theme: ResolvedTheme;
  }

  /** Runtime values the main process resolves for the renderers. */
  interface RuntimeInfo {
    frameStyle: FrameStyle;
    detectedFrameStyle: FrameStyle;
    theme: ResolvedTheme;
  }

  interface FeatureFlags {
    desktop_beta_use_agent_for_fonts?: boolean;
  }

  interface WindowState {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximized: boolean;
    lastActiveTabPath: string;
    hasOpenedCommunityTab: boolean;
    userId: string;
    tabs: SavedTab[];
  }

  interface CommandSwitch {
    switch: string;
    value?: string;
  }
  interface SettingsInterface {
    clientId: string;
    userId: string;
    authedUserIDs: string[];
    app: {
      logLevel: number;
      lastTimeClearLogFile: number;
      enableColorSpaceSrgb: boolean;
      enableWebGPU: boolean;
      useZenity: boolean;
      panelHeight: number;
      saveLastOpenedTabs: boolean;
      exportDir: string;
      fontDirs: string[];
      recentlyClosedTabs: SavedTab[];
      commandSwitches: CommandSwitch[];
      frameStyle: FrameStyle;
      frameStyleAuto: boolean;
      hideWindowMinMaxButtons: boolean;
      /** Render the new-tab "+" after the last tab instead of in the left corner. */
      newTabButtonAfterTabs: boolean;
      /** Show a card with the tab's last thumbnail when the pointer rests on it. */
      tabHoverPreviews: boolean;
      trayEnabled: boolean;
      windowsState: {
        [key: string]: WindowState;
      };
      lastOpenedTabs:
        | {
            [key: string]: SavedTab[];
          }
        | SavedTab[];
      featureFlags: FeatureFlags;
      savedExtensions: Extensions.ExtensionJson[];
      lastSavedPluginDir?: string;
      lastExportDir?: string;
      figmaTheme?: FigmaThemePreference;
      lastSeenChangelogVersion?: string;
    };
    mcp: {
      serverEnabled: boolean;
      serverPort: number;
      enableWriteTools: boolean;
      cdpEnabled: boolean;
      remoteDebugPort: number;
    };
    ui: {
      scalePanel: number;
      scaleFigmaUI: number;
    };
    [path: string]: any;
  }
}
