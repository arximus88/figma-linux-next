/**
 * screenshotLimits.ts — how big a get_screenshot answer may get (#93).
 *
 * MCP clients cap a response: the Pi coding agent rejects anything over
 * 16 MiB, and the call fails with nothing the agent can act on. A large frame
 * at `maxDimension: 65536`, or at `scale: 4`, or a whole page (no width or
 * height, so it used to export at 1x), easily passed it.
 */

/** Longest edge, in pixels, any screenshot is exported at, whatever is asked. */
export const SCREENSHOT_MAX_EDGE = 8192;

/** Longest edge when neither `maxDimension` nor `scale` is given. */
export const SCREENSHOT_DEFAULT_EDGE = 1024;

/**
 * Largest base64 payload sent inline. Leaves headroom under the common
 * 16 MiB client cap for the JSON envelope and the metadata text.
 */
export const INLINE_IMAGE_MAX_BASE64 = 12 * 1024 * 1024;

/** The longest-edge cap the in-page script applies for the given arguments. */
export function screenshotEdgeCap(maxDimension: unknown, scale: number | null): number {
  if (typeof maxDimension === "number" && maxDimension > 0) {
    return Math.min(SCREENSHOT_MAX_EDGE, Math.max(1, Math.round(maxDimension)));
  }
  // An explicit scale is the caller's choice of size: only the hard cap applies.
  return scale !== null ? SCREENSHOT_MAX_EDGE : SCREENSHOT_DEFAULT_EDGE;
}

/** "12.3 MiB" */
export function mib(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
