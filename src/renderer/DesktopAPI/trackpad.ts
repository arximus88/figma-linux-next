import * as E from "electron";
import {
  type Glide,
  glideStep,
  isMouseWheelNotch,
  MOMENTUM_RELEASE_MS,
  MomentumTracker,
  scaleTrackpadWheel,
  type TrackpadTuning,
} from "Utils/Common/trackpad";

/**
 * Rescales trackpad pan and pinch on the Figma canvas and, if enabled, lets
 * them glide on after the fingers lift (#47). See Utils/Common/trackpad for
 * which events count and by how much.
 *
 * The original event is stopped in the capture phase and a copy with scaled
 * deltas is dispatched on the same target; Figma's canvas handles untrusted
 * wheel events like real ones. Only events aimed at a <canvas> are touched: a
 * synthetic wheel event never scrolls an element natively, so rescaling one
 * over the layers list would stop that list from scrolling.
 */

let tuning: TrackpadTuning = { pan: 1, zoom: 1, momentum: false, glide: 0.85 };
const ours = new WeakSet<Event>();

const apply = (app: Partial<Types.SettingsInterface["app"]> | undefined) => {
  tuning = {
    pan: app?.trackpadPanSpeed ?? 1,
    zoom: app?.trackpadZoomSpeed ?? 1,
    momentum: app?.trackpadMomentum ?? false,
    glide: app?.trackpadMomentumGlide ?? 0.85,
  };
};

const tracker = new MomentumTracker();
/** Where the gesture was: the glide keeps zooming around the same point. */
let last: { target: HTMLCanvasElement; init: WheelEventInit } | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let glideFrame: number | null = null;

function dispatch(target: HTMLCanvasElement, init: WheelEventInit) {
  const copy = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  ours.add(copy);
  target.dispatchEvent(copy);
}

/** Stop a glide in progress and the pending release check; the gesture so far is kept. */
function cancelGlide() {
  if (releaseTimer !== null) clearTimeout(releaseTimer);
  if (glideFrame !== null) cancelAnimationFrame(glideFrame);
  releaseTimer = null;
  glideFrame = null;
}

/** Stop everything and forget the gesture: a click, a key, the tab going away. */
function stopMomentum() {
  cancelGlide();
  tracker.clear();
}

function runGlide(start: Glide) {
  const from = last;
  if (!from) return;
  let glide: Glide | null = start;
  let prev = performance.now();
  const frame = (now: number) => {
    glideFrame = null;
    if (!glide || !from.target.isConnected || !tuning.momentum) return;
    const step = glideStep(glide, now - prev, tuning.glide);
    prev = now;
    dispatch(from.target, { ...from.init, deltaX: step.deltaX, deltaY: step.deltaY });
    glide = step.next;
    if (glide) glideFrame = requestAnimationFrame(frame);
  };
  glideFrame = requestAnimationFrame(frame);
}

function onWheel(e: WheelEvent) {
  if (ours.has(e)) return;
  // Any real wheel event, a finger back on the pad included, ends a glide. The
  // gesture history must survive it: every event of a swipe passes through here.
  cancelGlide();
  if (!(e.target instanceof HTMLCanvasElement)) return;

  const like = {
    ctrlKey: e.ctrlKey,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    wheelDeltaX: (e as any).wheelDeltaX,
    wheelDeltaY: (e as any).wheelDeltaY,
  };
  if (isMouseWheelNotch(like)) return;
  const scaled = scaleTrackpadWheel(like, tuning);

  if (tuning.momentum && e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
    const seen = scaled ?? { deltaX: e.deltaX, deltaY: e.deltaY };
    tracker.record({ ctrlKey: e.ctrlKey, ...seen, time: e.timeStamp });
    last = {
      target: e.target,
      init: {
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        deltaMode: e.deltaMode,
      },
    };
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      const glide = tracker.release();
      if (glide) runGlide(glide);
    }, MOMENTUM_RELEASE_MS);
  }

  if (!scaled) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  dispatch(e.target, {
    clientX: e.clientX,
    clientY: e.clientY,
    screenX: e.screenX,
    screenY: e.screenY,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    deltaMode: e.deltaMode,
    deltaX: scaled.deltaX,
    deltaY: scaled.deltaY,
    deltaZ: e.deltaZ,
  });
}

export function installTrackpadTuning(): void {
  E.ipcRenderer
    .invoke("getSettings")
    .then((settings: Types.SettingsInterface) => apply(settings?.app))
    .catch(() => {});
  E.ipcRenderer.on("trackpadSpeedsChanged", (_, next: TrackpadTuning) => {
    tuning = next;
    if (!next.momentum) stopMomentum();
  });
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  // A click, a key or leaving the tab stops the canvas where it is.
  window.addEventListener("pointerdown", stopMomentum, { capture: true });
  window.addEventListener("keydown", stopMomentum, { capture: true });
  document.addEventListener("visibilitychange", stopMomentum);
}
