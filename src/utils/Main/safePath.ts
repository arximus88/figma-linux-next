import * as path from "node:path";

/**
 * True when `file` resolves to a location inside one of `dirs` (or is one of
 * them). Symlinks are not followed: the check is on the path the renderer
 * asked for, which is what stops `..` and absolute escapes.
 */
export function isInsideDirs(file: string, dirs: readonly string[]): boolean {
  const target = path.resolve(file);
  return dirs.some((dir) => {
    const root = path.resolve(dir);
    return target === root || target.startsWith(root + path.sep);
  });
}

/**
 * Turn an export file name from the web app into a relative path that stays
 * inside the chosen directory. Subfolders from `/` in frame names are kept
 * (`Icons / home.png` → `Icons/home.png`; the spaces around the slash are
 * how Figma users write it, not part of the folder name); absolute paths,
 * `..` and empty or dot-only parts are refused.
 */
export function safeExportName(name: string): string | null {
  const parts = name
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim());

  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      return null;
    }
  }

  return parts.join(path.sep);
}
