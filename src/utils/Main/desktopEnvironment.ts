/**
 * Desktop-environment detection for the automatic window-frame style.
 *
 * Only the main process sees the session environment, so the resolution lives
 * here and the renderers receive the result over IPC (`getRuntimeInfo`).
 * Flatpak forwards XDG_CURRENT_DESKTOP from the host session, so the same
 * logic holds inside the sandbox.
 */

const KDE_MARKERS = ["kde", "plasma"];
/** Desktops whose windows carry an Adwaita-style headerbar. */
const GNOME_MARKERS = ["gnome", "budgie"];

/**
 * Pick the frame style that matches the running desktop.
 *
 * `XDG_CURRENT_DESKTOP` is a colon-separated list ("ubuntu:GNOME", "KDE"),
 * `DESKTOP_SESSION` a single name ("plasma", "gnome-xorg"). KDE/Plasma gets the
 * Breeze frame, GNOME and its headerbar relatives (Budgie) the Adwaita one.
 * Everything else — Pantheon, Cinnamon, XFCE, MATE, tiling compositors, an
 * empty environment — gets the Legacy Windows frame: it mimics no particular
 * desktop, so it looks intentional where a borrowed Adwaita headerbar looks
 * out of place.
 */
export function detectFrameStyle(env: NodeJS.ProcessEnv = process.env): Types.FrameStyle {
  const haystack = [env.XDG_CURRENT_DESKTOP, env.DESKTOP_SESSION]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .flatMap((v) => v.split(":"))
    .map((v) => v.trim().toLowerCase());

  if (haystack.some((token) => KDE_MARKERS.some((marker) => token.includes(marker)))) {
    return "kde";
  }

  if (haystack.some((token) => GNOME_MARKERS.some((marker) => token.includes(marker)))) {
    return "gnome";
  }

  return "windows";
}

/** Human label for the detected style, shown as a hint in Settings. */
export function resolveFrameStyle(app: {
  frameStyle: Types.FrameStyle;
  frameStyleAuto: boolean;
}): Types.FrameStyle {
  return app.frameStyleAuto ? detectFrameStyle() : app.frameStyle;
}
