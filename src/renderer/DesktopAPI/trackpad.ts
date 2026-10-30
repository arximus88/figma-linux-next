import * as E from "electron";
import { scaleTrackpadWheel, type TrackpadSpeeds } from "Utils/Common/trackpad";

/**
 * Rescales trackpad pan and pinch on the Figma canvas (#47). See
 * Utils/Common/trackpad for which events count and by how much.
 *
 * The original event is stopped in the capture phase and a copy with scaled
 * deltas is dispatched on the same target; Figma's canvas handles untrusted
 * wheel events like real ones. Only events aimed at a <canvas> are touched: a
 * synthetic wheel event never scrolls an element natively, so rescaling one
 * over the layers list would stop that list from scrolling.
 */

let speeds: TrackpadSpeeds = { pan: 1, zoom: 1 };
const ours = new WeakSet<Event>();

const apply = (app: { trackpadPanSpeed?: number; trackpadZoomSpeed?: number } | undefined) => {
  speeds = { pan: app?.trackpadPanSpeed ?? 1, zoom: app?.trackpadZoomSpeed ?? 1 };
};

function onWheel(e: WheelEvent) {
  if (ours.has(e) || !(e.target instanceof HTMLCanvasElement)) return;

  const scaled = scaleTrackpadWheel(
    {
      ctrlKey: e.ctrlKey,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      wheelDeltaX: (e as any).wheelDeltaX,
      wheelDeltaY: (e as any).wheelDeltaY,
    },
    speeds,
  );
  if (!scaled) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const copy = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
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
  ours.add(copy);
  e.target.dispatchEvent(copy);
}

export function installTrackpadTuning(): void {
  E.ipcRenderer
    .invoke("getSettings")
    .then((settings: Types.SettingsInterface) => apply(settings?.app))
    .catch(() => {});
  E.ipcRenderer.on("trackpadSpeedsChanged", (_, next: TrackpadSpeeds) => {
    speeds = next;
  });
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
}
