/**
 * fileKey routing — Figma's remote MCP addresses every file tool by `fileKey`
 * (the id in figma.com/design/<fileKey>/...). This server used to act only on
 * the active tab, so an agent working across two files had to switch tabs
 * between calls. These helpers let a tool name the file instead.
 */

const FILE_PATH =
  /^\/(?:file|design|board|proto|slides|make|jam|figjam)\/([0-9a-zA-Z]+)(?:\/[^/]*)?(?:\/branch\/([0-9a-zA-Z]+))?/;

/** The fileKey (and branch key, when the URL is a branch) a Figma tab URL points at. */
export function fileKeysOfUrl(url: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  if (parsed.hostname !== "figma.com" && !parsed.hostname.endsWith(".figma.com")) return [];
  const match = parsed.pathname.match(FILE_PATH);
  if (!match) return [];
  return match[2] ? [match[1], match[2]] : [match[1]];
}

/** True when the tab at `url` shows the file (or branch) `fileKey`. */
export function urlMatchesFileKey(url: string, fileKey: string): boolean {
  return fileKeysOfUrl(url).includes(fileKey);
}

/**
 * Read `fileKey` from tool arguments. Accepts a bare key or a pasted figma.com
 * URL (agents often pass the URL). Returns undefined when absent, and throws on
 * something that is neither — silently falling back to the active tab would
 * run the tool on the wrong file.
 */
export function readFileKeyArg(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("fileKey must be a string");
  const trimmed = value.trim();
  if (/^[0-9a-zA-Z]{10,128}$/.test(trimmed)) return trimmed;
  const keys = fileKeysOfUrl(trimmed);
  // A branch URL means the branch: Figma's remote server uses the branch key there too.
  if (keys.length) return keys[keys.length - 1];
  throw new Error(`fileKey "${trimmed}" is not a Figma file key or file URL`);
}
