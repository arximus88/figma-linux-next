import { describe, expect, it } from "bun:test";
import { isMouseWheelNotch, scaleTrackpadWheel } from "Utils/Common/trackpad";

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
