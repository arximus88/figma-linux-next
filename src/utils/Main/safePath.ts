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
 * Reduce an export file name from the web app to something that stays inside
 * the chosen directory: drops any directory part (`../`, absolute prefixes)
 * and refuses empty or dot-only names.
 */
export function safeExportName(name: string): string | null {
  const base = path.basename(name.replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") return null;
  return base;
}
