declare namespace Types {
  type EditorType = "design" | "figjam" | "slides" | "buzz" | "site" | "make" | "prototype";

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
      hideWindowMinMaxButtons: boolean;
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
      figmaTheme?: "dark" | "light";
      lastSeenChangelogVersion?: string;
    };
    mcp: {
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
