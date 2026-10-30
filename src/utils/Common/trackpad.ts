/**
 * Trackpad speed for the Figma canvas (#47).
 *
 * On Linux Chromium hands Figma a two-finger pan as a plain wheel event and a
 * pinch as a wheel event with `ctrlKey` set. Figma tunes both for macOS, where
 * the deltas are different: users find panning too fast and pinch-zoom too
 * slow. The tab preload rescales those deltas; this module decides by how much.
 *
 * A mouse wheel is left alone: its ticks report `wheelDelta` in whole steps of
 * 120, a trackpad does not.
 */

export const TRACKPAD_SPEED_MIN = 0.25;
export const TRACKPAD_SPEED_MAX = 4;

export interface TrackpadSpeeds {
  /** Two-finger pan on the canvas. 1 = unchanged. */
  pan: number;
  /** Pinch-to-zoom on the canvas. 1 = unchanged. */
  zoom: number;
}

export interface WheelLike {
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
  /** Legacy, but Chromium still fills it: ±120 per mouse-wheel notch. */
  wheelDeltaX?: number;
  wheelDeltaY?: number;
}

export function isValidTrackpadSpeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= TRACKPAD_SPEED_MIN &&
    value <= TRACKPAD_SPEED_MAX
  );
}

const isNotch = (wheelDelta: number | undefined) =>
  wheelDelta !== undefined && wheelDelta !== 0 && wheelDelta % 120 === 0;

/** A notch of a mouse wheel (on the axis that moved), not a trackpad gesture. */
export function isMouseWheelNotch(e: WheelLike): boolean {
  const x = e.wheelDeltaX ?? 0;
  const y = e.wheelDeltaY ?? 0;
  if (x === 0 && y === 0) return false;
  return (x === 0 || isNotch(x)) && (y === 0 || isNotch(y));
}

/**
 * The deltas Figma should see instead, or `null` to let the event through
 * untouched (mouse wheel, speed 1, nothing to scale).
 */
export function scaleTrackpadWheel(
  e: WheelLike,
  speeds: TrackpadSpeeds,
): { deltaX: number; deltaY: number } | null {
  const factor = e.ctrlKey ? speeds.zoom : speeds.pan;
  if (factor === 1 || !isValidTrackpadSpeed(factor)) return null;
  if (e.deltaX === 0 && e.deltaY === 0) return null;
  if (isMouseWheelNotch(e)) return null;
  return { deltaX: e.deltaX * factor, deltaY: e.deltaY * factor };
}
