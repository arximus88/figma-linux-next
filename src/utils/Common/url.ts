import { PROTOCOL, HOMEPAGE } from "Const";

// Modernized URL handling logic based on figma-linux-fork analysis

export const isFigmaRunUrl = (url: string): boolean => {
  const parsed = parseURL(url);
  if (!parsed) return false;

  // Figma protocol
  if (parsed.protocol === `${PROTOCOL}:` || parsed.protocol === "figma:") {
    return true;
  }

  // Web URLs
  if (/(w{0,3}\.)?figma\.com/.test(parsed.hostname)) {
    const validPaths = [
      /^\/file\//, // Old file structure
      /^\/files\//, // File browser
      /^\/proto\//, // Prototypes
      /^\/design\//, // New design files
      /^\/board\//, // FigJam boards
      /^\/jam\//, // Old FigJam
      /^\/drafts\//, // Drafts
      /^\/make\//, // Figma Make (AI design tool)
    ];

    return validPaths.some((regex) => regex.test(parsed.pathname));
  }

  return false;
};

export const isCommunityUrl = (url: string): boolean => {
  const parsed = parseURL(url);
  return (
    parsed &&
    /(w{0,3}\.)?figma\.com/.test(parsed.hostname) &&
    /^\/community\//.test(parsed.pathname)
  );
};

export const isPrototypeUrl = (url: string): boolean => {
  return /figma\.com\/proto\//.test(url);
};

export const isFigmaUrl = (url: string): boolean =>
  /^(https?:\/\/w{0,3}?\.?figma\.com\/.*)/.test(url);

export const isFigmaProtocolUrl = (url: string): boolean => {
  return url.startsWith("figma://");
};

export const parseURL = (url: string): URL | undefined => {
  try {
    return new URL(url);
  } catch (_a) {
    return undefined;
  }
};

export const normalizeUrl = (url: string): string => {
  if (!isFigmaProtocolUrl(url)) {
    return url;
  }
  return url.replace(/^figma:\//, HOMEPAGE);
};

export const isAppAuthGrandLink = (url: string) => /\/app_auth\/.*\/grant/.test(url);
export const isAppAuthRedeem = (url: string) => /\/app_auth\/redeem\?g_secret=.+/.test(url);

export const isAppAuthLink = (url: string) => /figma:\/\/app_auth\/redeem\?g_secret=.*/.test(url);

// Deprecated or legacy checks, kept for compatibility but should use isFigmaRunUrl
export const isRecentFilesLink = (url: string) =>
  /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com\/files\/recent)/.test(url);

export const isValidProjectLink = (url: string) =>
  /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com\/file\/)/.test(url);

export const isValidFigjamLink = (url: string) =>
  /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com\/jam)/.test(url);

/** /files/ paths are the home/files browser (recents, team, project).
 *  They should stay in the MainTab, not be opened as a new design-file tab. */
export const isFileBrowserUrl = (url: string): boolean => {
  const parsed = parseURL(url);
  return !!parsed && /(w{0,3}\.)?figma\.com/.test(parsed.hostname) && /^\/files\//.test(parsed.pathname);
};

export const isFigmaDocLink = (url: string) =>
  /^https:\/\/w{0,3}?.figma.com\/plugin-docs/.test(url);
export const isFigmaBoardLink = (url: string) => /^https:\/\/w{0,3}?.figma.com\/board/.test(url);
export const isFigmaDesignLink = (url: string) => /^https:\/\/w{0,3}?.figma.com\/design/.test(url);

export const getFileKeyFromUrl = (url: string): string | null => {
  const parsed = parseURL(url);
  if (!parsed) return null;

  const path = parsed.pathname;
  const match = path.match(/^\/(file|design|board|proto)\/([a-zA-Z0-9]+)/);

  if (match && match[2]) {
    return match[2];
  }

  return null;
};
