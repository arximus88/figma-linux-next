import { PROTOCOL, HOMEPAGE } from "Const";

// Modernized URL handling logic based on figma-linux-fork analysis

export const parseURL = (url: string): URL | undefined => {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
};

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
      /^\/site\//, // Figma Sites
      /^\/buzz\//, // Figma Buzz (social/marketing templates)
      /^\/slides\//, // Figma Slides (presentations)
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
  return (
    !!parsed && /(w{0,3}\.)?figma\.com/.test(parsed.hostname) && /^\/files\//.test(parsed.pathname)
  );
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

  if (match?.[2]) {
    return match[2];
  }

  return null;
};

/** Map Figma's editor-type strings (often internal codenames) to our canonical
 *  EditorType. Confirmed codenames observed in production payloads (2026-05):
 *    cooper  = Buzz
 *    figmake = Make
 *    sites   = Site (Figma uses plural in some payloads)
 *  Returns null for unknown values so the caller can log them. */
export const normalizeEditorType = (raw: string): Types.EditorType | null => {
  if (typeof raw !== "string") return null;
  const v = raw.toLowerCase().trim();
  if (v === "design" || v === "design_file" || v === "file") return "design";
  if (v === "figjam" || v === "whiteboard" || v === "jam" || v === "board") return "figjam";
  if (v === "slides" || v === "deck" || v === "slide" || v === "presentation" || v === "figslides")
    return "slides";
  if (v === "buzz" || v === "cooper" || v === "marketing") return "buzz";
  if (v === "site" || v === "sites" || v === "weave" || v === "figsite" || v === "figma_site")
    return "site";
  if (v === "make" || v === "figmake" || v === "code" || v === "figma_make") return "make";
  if (v === "proto" || v === "prototype") return "prototype";
  return null;
};

/** Derive a tab's editor type from its URL. Returns null for non-Figma URLs
 *  (e.g. the home/files browser). Library vs. design-file cannot be inferred
 *  from the URL — Figma signals that separately via `setIsLibrary`. */
export const getEditorTypeFromUrl = (url: string): Types.EditorType | null => {
  const parsed = parseURL(url);
  if (!parsed) return null;
  const p = parsed.pathname;
  if (/^\/(design|file)\//.test(p)) return "design";
  if (/^\/(board|jam)\//.test(p)) return "figjam";
  if (/^\/slides\//.test(p)) return "slides";
  if (/^\/buzz\//.test(p)) return "buzz";
  if (/^\/site\//.test(p)) return "site";
  if (/^\/make\//.test(p)) return "make";
  if (/^\/proto\//.test(p)) return "prototype";
  return null;
};

/** Dedup key for "is this URL already open in a tab?" — separates the prototype
 *  viewer (/proto/<key>) from the editor (/file|design|board/<key>) so both
 *  can coexist as distinct tabs for the same document. */
export const getTabDedupKey = (url: string): string | null => {
  const parsed = parseURL(url);
  if (!parsed) return null;

  const match = parsed.pathname.match(/^\/(file|design|board|proto)\/([a-zA-Z0-9]+)/);
  if (!match) return null;

  const [, type, key] = match;
  return type === "proto" ? `proto:${key}` : `doc:${key}`;
};
