import { describe, expect, it } from "bun:test";
import {
  type Glide,
  glideStep,
  isMouseWheelNotch,
  MomentumTracker,
  scaleTrackpadWheel,
} from "Utils/Common/trackpad";

// Shapes Chromium hands the page on Linux (wheelDelta is the legacy field it still fills).
const mouseNotch = { ctrlKey: false, deltaX: 0, deltaY: 100, wheelDeltaX: 0, wheelDeltaY: -120 };
const mouseCtrlNotch = { ...mouseNotch, ctrlKey: true };
const trackpadPan = {
  ctrlKey: false,
  deltaX: 3.5,
  deltaY: 12.25,
  wheelDeltaX: -4,
  wheelDeltaY: -15,
};
const pinch = { ctrlKey: true, deltaX: 0, deltaY: -2.4, wheelDeltaX: 0, wheelDeltaY: 3 };

describe("trackpad speed", () => {
  it("leaves every event alone at the default 1×", () => {
    const speeds = { pan: 1, zoom: 1 };
    expect(scaleTrackpadWheel(trackpadPan, speeds)).toBeNull();
    expect(scaleTrackpadWheel(pinch, speeds)).toBeNull();
  });

  it("slows a two-finger pan without touching pinch", () => {
    const speeds = { pan: 0.5, zoom: 1 };
    expect(scaleTrackpadWheel(trackpadPan, speeds)).toEqual({ deltaX: 1.75, deltaY: 6.125 });
    expect(scaleTrackpadWheel(pinch, speeds)).toBeNull();
  });

  it("speeds up pinch zoom without touching pan", () => {
    const speeds = { pan: 1, zoom: 3 };
    expect(scaleTrackpadWheel(pinch, speeds)?.deltaY).toBeCloseTo(-7.2);
    expect(scaleTrackpadWheel(trackpadPan, speeds)).toBeNull();
  });

  it("never rescales a mouse wheel, with or without Ctrl", () => {
    const speeds = { pan: 0.25, zoom: 4 };
    expect(isMouseWheelNotch(mouseNotch)).toBe(true);
    expect(scaleTrackpadWheel(mouseNotch, speeds)).toBeNull();
    expect(scaleTrackpadWheel(mouseCtrlNotch, speeds)).toBeNull();
    expect(
      scaleTrackpadWheel({ ...mouseNotch, deltaY: 300, wheelDeltaY: -360 }, speeds),
    ).toBeNull();
  });

  it("treats a horizontal mouse notch as a mouse too", () => {
    const tilt = { ctrlKey: false, deltaX: 100, deltaY: 0, wheelDeltaX: -120, wheelDeltaY: 0 };
    expect(scaleTrackpadWheel(tilt, { pan: 0.5, zoom: 1 })).toBeNull();
  });

  it("ignores a speed outside the allowed range instead of applying it", () => {
    expect(scaleTrackpadWheel(trackpadPan, { pan: 0, zoom: 1 })).toBeNull();
    expect(scaleTrackpadWheel(trackpadPan, { pan: Number.NaN, zoom: 1 })).toBeNull();
    expect(scaleTrackpadWheel(pinch, { pan: 1, zoom: 40 })).toBeNull();
  });
});

const FRAME = 1000 / 60;

/** A gesture of `count` events, one per 60 Hz frame, each with the same deltas. */
function swipe(
  tracker: MomentumTracker,
  deltas: { ctrlKey?: boolean; dx?: number; dy?: number },
  count: number,
  t0 = 0,
) {
  for (let i = 0; i < count; i++) {
    tracker.record({
      ctrlKey: deltas.ctrlKey ?? false,
      deltaX: deltas.dx ?? 0,
      deltaY: deltas.dy ?? 0,
      time: t0 + i * FRAME,
    });
  }
}

/** Play a glide to rest at 60 Hz: total distance and number of frames. */
function playOut(g: Glide, glide: number, frameMs = FRAME) {
  let cur: Glide | null = g;
  let dx = 0;
  let dy = 0;
  let frames = 0;
  while (cur && frames < 10_000) {
    const step = glideStep(cur, frameMs, glide);
    dx += step.deltaX;
    dy += step.deltaY;
    cur = step.next;
    frames++;
  }
  return { dx, dy, frames };
}

describe("trackpad momentum", () => {
  it("lets a flick go with the speed it had at the end", () => {
    const t = new MomentumTracker();
    swipe(t, { dx: 4, dy: 20 }, 6);
    const g = t.release()!;
    expect(g.ctrlKey).toBe(false);
    expect(g.vx).toBeCloseTo(4);
    expect(g.vy).toBeCloseTo(20);
  });

  it("does not glide when the fingers slowed down before lifting", () => {
    const t = new MomentumTracker();
    // A fast start that ended slow: only the end counts.
    swipe(t, { dy: 30 }, 6);
    swipe(t, { dy: 0.5 }, 6, 6 * FRAME);
    expect(t.release()).toBeNull();
  });

  it("does not glide after a single nudge", () => {
    const t = new MomentumTracker();
    swipe(t, { dy: 40 }, 1);
    expect(t.release()).toBeNull();
  });

  it("forgets the old gesture: a pause, then release, is not a flick", () => {
    const t = new MomentumTracker();
    swipe(t, { dy: 20 }, 6);
    // A lone event 300 ms later: the earlier samples are out of the window.
    t.record({ ctrlKey: false, deltaX: 0, deltaY: 20, time: 300 + 6 * FRAME });
    expect(t.release()).toBeNull();
  });

  it("releases only once", () => {
    const t = new MomentumTracker();
    swipe(t, { dy: 20 }, 4);
    expect(t.release()).not.toBeNull();
    expect(t.release()).toBeNull();
  });

  it("keeps pinch and pan apart, so a pinch glides as a zoom", () => {
    const t = new MomentumTracker();
    swipe(t, { dy: 20 }, 4);
    swipe(t, { ctrlKey: true, dy: -3 }, 4, 4 * FRAME);
    const g = t.release()!;
    expect(g.ctrlKey).toBe(true);
    expect(g.vy).toBeCloseTo(-3);
  });

  it("caps a wild flick", () => {
    const t = new MomentumTracker();
    swipe(t, { dy: 5000 }, 4);
    expect(t.release()!.vy).toBe(150);
  });

  it("slows down and comes to rest; a higher glide goes further", () => {
    const g: Glide = { ctrlKey: false, vx: 0, vy: 20 };
    const short = playOut(g, 0.7);
    const long = playOut(g, 0.95);
    expect(short.dy).toBeGreaterThan(20);
    expect(long.dy).toBeGreaterThan(short.dy * 4);
    expect(long.frames).toBeLessThan(200);
    const first = glideStep(g, FRAME, 0.85);
    expect(first.deltaY).toBeCloseTo(20);
    expect(first.next!.vy).toBeCloseTo(17);
  });

  it("covers the same distance at 144 Hz as at 60 Hz", () => {
    const g: Glide = { ctrlKey: false, vx: 10, vy: 0 };
    const at60 = playOut(g, 0.85);
    const at144 = playOut(g, 0.85, 1000 / 144);
    expect(Math.abs(at144.dx - at60.dx) / at60.dx).toBeLessThan(0.15);
  });

  it("does not jump after a stalled frame", () => {
    const step = glideStep({ ctrlKey: false, vx: 0, vy: 20 }, 2000, 0.85);
    expect(step.deltaY).toBeLessThanOrEqual(20 * (50 / FRAME) + 1e-9);
  });
});
