const _env = typeof process !== "undefined" && process.env ? process.env : {};
export const LOGLEVEL = _env.FIGMA_LOGLEVEL as string | undefined;

export const HOMEPAGE = "https://www.figma.com";
export const LOGOUT_PAGE = `${HOMEPAGE}/logout`;
export const LOGIN_PAGE = `${HOMEPAGE}/login`;
export const RECENT_FILES = `${HOMEPAGE}/files/recent`;
export const NEW_PROJECT_TAB_URL = `${HOMEPAGE}/desktop_new_tab`;
export const COMMUNITY_TAB_URL = `${HOMEPAGE}/@figma_linux`;
// export const PARSED_HOMEPAGE = parse("https://www.figma.com");
export const PARSED_HOMEPAGE = new URL("https://www.figma.com");

export const TOPPANELHEIGHT = 40;
export const MENU_WIDTH = 330;

export const STARTUP_DELAY_MS = 1500;

export const PROTOCOL = "figma";

export const MANIFEST_FILE_NAME = "manifest.json";
export const CHROME_GPU = "chrome://gpu";

export const CONFIGDIR = `${_env.HOME || ""}/.config/figma-linux-next`;
export const RESOURCESDIR = `${_env.HOME || ""}/.config/figma-linux-next/resources`;
export const REGEXP_APP_AUTH_GRANT = /^\/{0,2}app_auth\/[^/]+\/grant/;

export const FIGMA_SESSION_COOKIE_NAME = "figma.session";

export const FILE_WHITE_LIST = [".gitignore"];
export const FILE_EXTENSION_WHITE_LIST = [
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".ts",
  ".tsx",
];

export const NEW_FILE_TAB_TITLE = "New file";

export const LINKS = {
  HELP_PAGE: "https://help.figma.com",
  PLUGINS_DOCS: `${HOMEPAGE}/plugin-docs/`,
  FIGMA_LINUX_COMMUNITY_FORUM: "https://github.com/arximus88/figma-linux-next/discussions",
  THEMES_REPO: "https://github.com/Figma-Linux/figma-linux-themes",
  VIDEO_TUTORIALS: "https://www.youtube.com/figmadesign",
  RELEASE_NOTES: "https://github.com/arximus88/figma-linux-next/releases/latest",
  LEGAL_SUMMARY: `${HOMEPAGE}/summary-of-policy`,
};
