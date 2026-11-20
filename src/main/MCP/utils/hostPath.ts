/**
 * hostPath.ts — can the MCP client on the host see a file the app writes?
 *
 * Outside a sandbox, always. Under Flatpak only the paths the app was granted
 * write access to are the host's own: `/tmp` and most of `$HOME` are private
 * to the sandbox. A screenshot written to `/tmp/x.png` used to be reported as
 * `savedTo: /tmp/x.png` while the host's `/tmp` had nothing (#92, section 11):
 * the file sat in `$XDG_RUNTIME_DIR/.flatpak/<id>/tmp` and went away with the
 * app.
 *
 * The grants are read from `/.flatpak-info` (`[Context] filesystems=`), which
 * includes the user's `flatpak override`s, so a user who grants more gets more.
 * Everything here is pure except `loadSandbox()`.
 */

import fs from "node:fs";
import path from "node:path";

export interface SandboxInfo {
  /** `FLATPAK_ID`. */
  appId: string;
  /** Entries of `[Context] filesystems=`, as written there. */
  filesystems: string[];
}

/**
 * Top-level directories `--filesystem=host` does not share (flatpak's
 * `dont_mount_in_root`). `/tmp` is among them: it needs its own grant.
 */
const HOST_NOT_SHARED = new Set([
  "app",
  "bin",
  "boot",
  "dev",
  "etc",
  "lib",
  "lib32",
  "lib64",
  "proc",
  "root",
  "run",
  "sbin",
  "sys",
  "tmp",
  "usr",
  "var",
]);

/** `xdg-<name>` grant → the key the resolver is asked for. */
const XDG_NAMES: Record<string, string> = {
  "xdg-desktop": "desktop",
  "xdg-documents": "documents",
  "xdg-download": "downloads",
  "xdg-music": "music",
  "xdg-pictures": "pictures",
  "xdg-public-share": "publicShare",
  "xdg-templates": "templates",
  "xdg-videos": "videos",
  "xdg-config": "config",
  "xdg-cache": "cache",
  "xdg-data": "data",
  "xdg-run": "runtime",
};

/** The `filesystems=` list of a `/.flatpak-info` file. */
export function parseFlatpakFilesystems(info: string): string[] {
  let inContext = false;
  for (const raw of info.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inContext = line === "[Context]";
      continue;
    }
    if (inContext && line.startsWith("filesystems=")) {
      return line
        .slice("filesystems=".length)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export interface WritableRoots {
  /** Directories (absolute) whose whole subtree the host shares, writable. */
  roots: string[];
  /** `--filesystem=host`: everything outside HOST_NOT_SHARED, too. */
  host: boolean;
}

/**
 * The writable directories a grant list gives. `:ro` grants are left out (a
 * write there fails anyway), and so are negated ones (`!xdg-download`).
 */
export function writableRoots(
  sandbox: SandboxInfo,
  home: string,
  xdgDir: (name: string) => string | null,
): WritableRoots {
  // The app's own data directory is the same path on the host.
  const roots = [path.join(home, ".var", "app", sandbox.appId)];
  let host = false;
  const negated = new Set(
    sandbox.filesystems.filter((e) => e.startsWith("!")).map((e) => e.slice(1).split(":")[0]),
  );
  for (const entry of sandbox.filesystems) {
    if (entry.startsWith("!")) continue;
    const [spec, mode] = entry.split(":");
    if (mode === "ro" || negated.has(spec)) continue;
    if (spec === "host" || spec === "host-os" || spec === "host-etc") {
      if (spec === "host") host = true;
      continue;
    }
    const resolved = resolveGrant(spec, home, xdgDir);
    if (resolved) roots.push(resolved);
  }
  return { roots, host };
}

function resolveGrant(
  spec: string,
  home: string,
  xdgDir: (name: string) => string | null,
): string | null {
  if (spec === "home") return home;
  if (spec.startsWith("~/")) return path.join(home, spec.slice(2));
  if (spec.startsWith("/")) return path.normalize(spec);
  const slash = spec.indexOf("/");
  const name = slash === -1 ? spec : spec.slice(0, slash);
  const rest = slash === -1 ? "" : spec.slice(slash + 1);
  const key = XDG_NAMES[name];
  if (!key) return null;
  const base = xdgDir(key);
  return base ? path.join(base, rest) : null;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Whether a write to `absPath` inside the sandbox lands where the host can see it. */
export function isHostVisible(absPath: string, writable: WritableRoots): boolean {
  const p = path.normalize(absPath);
  if (writable.roots.some((root) => isInside(p, root))) return true;
  if (writable.host) {
    const top = p.split(path.sep).filter(Boolean)[0] ?? "";
    if (!HOST_NOT_SHARED.has(top)) return true;
    // flatpak shares removable media under /run/media with `host`.
    if (isInside(p, "/run/media")) return true;
  }
  return false;
}

/** The sandbox this process runs in, or null when it is not a Flatpak. */
export function loadSandbox(env: NodeJS.ProcessEnv = process.env): SandboxInfo | null {
  if (!env.FLATPAK_ID) return null;
  let info = "";
  try {
    info = fs.readFileSync("/.flatpak-info", "utf8");
  } catch {
    // No info file: assume only the app's own directory is shared.
  }
  return { appId: env.FLATPAK_ID, filesystems: parseFlatpakFilesystems(info) };
}

/**
 * The directory a relative `savePath` resolves against: the configured one if
 * the host can see it, else `fallback`. Under Flatpak the default
 * (`~/Pictures/Figma`) is not granted, and a relative path would have landed
 * in the sandbox's private copy of `$HOME`.
 */
export function pickSaveBaseDir(
  preferred: string,
  fallback: string,
  visible: (absPath: string) => boolean,
): string {
  return visible(preferred) ? preferred : fallback;
}
