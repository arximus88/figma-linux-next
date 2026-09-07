/**
 * Desktop-environment detection for the automatic window-frame style.
 *
 * Only the main process sees the session environment, so the resolution lives
 * here and the renderers receive the result over IPC (`getRuntimeInfo`).
 * Flatpak forwards XDG_CURRENT_DESKTOP from the host session, so the same
 * logic holds inside the sandbox.
 */

const KDE_MARKERS = ["kde", "plasma"];

/**
 * Pick the frame style that matches the running desktop.
 *
 * `XDG_CURRENT_DESKTOP` is a colon-separated list ("ubuntu:GNOME", "KDE"),
 * `DESKTOP_SESSION` a single name ("plasma", "gnome-xorg"). Anything that is
 * not recognisably KDE falls back to the GNOME frame, which is what the app
 * shipped as its default before auto-detection existed.
 */
export function detectFrameStyle(env: NodeJS.ProcessEnv = process.env): Types.FrameStyle {
  const haystack = [env.XDG_CURRENT_DESKTOP, env.DESKTOP_SESSION]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .flatMap((v) => v.split(":"))
    .map((v) => v.trim().toLowerCase());

  if (haystack.some((token) => KDE_MARKERS.some((marker) => token.includes(marker)))) {
    return "kde";
  }

  return "gnome";
}

/** Human label for the detected style, shown as a hint in Settings. */
export function resolveFrameStyle(app: {
  frameStyle: Types.FrameStyle;
  frameStyleAuto: boolean;
}): Types.FrameStyle {
  return app.frameStyleAuto ? detectFrameStyle() : app.frameStyle;
}
