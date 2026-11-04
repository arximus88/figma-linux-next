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

/** Everything the tab preload needs, as broadcast on `trackpadSpeedsChanged`. */
export interface TrackpadTuning extends TrackpadSpeeds {
  /** Keep the canvas moving after the fingers lift. */
  momentum: boolean;
  /** Share of the glide speed kept per frame, 0.5–0.95. */
  glide: number;
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

/*
 * Momentum (#47, after figmix): when the fingers leave the trackpad mid-swipe
 * or mid-pinch, the canvas keeps moving and slows down, as on macOS. Chromium
 * on Linux does not tell the page when the fingers lift, so the tab preload
 * treats a pause in the wheel stream as the lift. If Chromium sends its own
 * kinetic events, the stream does not pause until they have died down, and
 * the speed left by then is below the threshold: the two never stack.
 */

export const MOMENTUM_GLIDE_MIN = 0.5;
export const MOMENTUM_GLIDE_MAX = 0.95;

/** How long the wheel stream must be quiet before it counts as the fingers lifting. */
export const MOMENTUM_RELEASE_MS = 40;

/** Speeds are measured per frame at 60 Hz, so the glide feels the same at any refresh rate. */
const FRAME_MS = 1000 / 60;
/** Only the last moments of a gesture set the speed it is released with. */
const HISTORY_MS = 100;
const HISTORY_MAX = 5;
/** Below this per-frame speed a release is a stop, not a flick (pan px / pinch delta). */
const START_PAN = 2;
const START_ZOOM = 0.5;
/** The glide ends once it is slower than this per frame. */
const STOP_PAN = 0.25;
const STOP_ZOOM = 0.05;
/** A wild flick still glides at a sane speed. */
const MAX_PAN = 150;
const MAX_ZOOM = 40;
/** After a dropped frame or a background tab, do not jump by seconds of motion at once. */
const MAX_STEP_MS = 50;

export function isValidMomentumGlide(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MOMENTUM_GLIDE_MIN &&
    value <= MOMENTUM_GLIDE_MAX
  );
}

export interface WheelSample {
  ctrlKey: boolean;
  /** The deltas Figma saw, after the speed setting. */
  deltaX: number;
  deltaY: number;
  /** Event time in ms (event.timeStamp). */
  time: number;
}

export interface Glide {
  /** A pinch (ctrlKey) or a pan. */
  ctrlKey: boolean;
  /** Per-frame speed at 60 Hz. */
  vx: number;
  vy: number;
}

const clampAbs = (v: number, max: number) => Math.max(-max, Math.min(max, v));

/** Remembers the end of the current gesture to work out the speed it is let go with. */
export class MomentumTracker {
  private samples: WheelSample[] = [];

  public record(sample: WheelSample): void {
    // A pinch that turns into a pan (or back) is a new gesture.
    if (this.samples.length && this.samples[0].ctrlKey !== sample.ctrlKey) this.samples = [];
    this.samples.push(sample);
    this.samples = this.samples
      .filter((s) => sample.time - s.time <= HISTORY_MS)
      .slice(-HISTORY_MAX);
  }

  public clear(): void {
    this.samples = [];
  }

  /** The stream paused: the glide to play, or null if the gesture was too slow to carry on. */
  public release(): Glide | null {
    const samples = this.samples;
    this.samples = [];
    if (samples.length < 2) return null; // one event is a nudge, not a flick
    const span = samples[samples.length - 1].time - samples[0].time;
    if (span < 1) return null;
    let dx = 0;
    let dy = 0;
    // The first sample only marks when the measured stretch starts.
    for (const s of samples.slice(1)) {
      dx += s.deltaX;
      dy += s.deltaY;
    }
    const ctrlKey = samples[0].ctrlKey;
    const max = ctrlKey ? MAX_ZOOM : MAX_PAN;
    const vx = clampAbs((dx / span) * FRAME_MS, max);
    const vy = clampAbs((dy / span) * FRAME_MS, max);
    if (Math.hypot(vx, vy) < (ctrlKey ? START_ZOOM : START_PAN)) return null;
    return { ctrlKey, vx, vy };
  }
}

/**
 * One frame of a glide: the deltas to send for the time that passed and the
 * slower glide that follows, or `next: null` when it has come to rest.
 * `glide` is the share of speed kept per 60 Hz frame.
 */
export function glideStep(
  g: Glide,
  elapsedMs: number,
  glide: number,
): { deltaX: number; deltaY: number; next: Glide | null } {
  const frames = Math.min(Math.max(elapsedMs, 0), MAX_STEP_MS) / FRAME_MS;
  const deltaX = g.vx * frames;
  const deltaY = g.vy * frames;
  const keep = glide ** frames;
  const vx = g.vx * keep;
  const vy = g.vy * keep;
  const stop = g.ctrlKey ? STOP_ZOOM : STOP_PAN;
  return {
    deltaX,
    deltaY,
    next: Math.hypot(vx, vy) < stop ? null : { ctrlKey: g.ctrlKey, vx, vy },
  };
}
