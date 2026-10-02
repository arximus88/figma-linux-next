/**
 * Settings saves as you edit. Every change to the store is sent to main a beat
 * later (typing a port shouldn't restart the MCP server once per digit), and
 * only the editable fields go — see Utils/Common/settingsEdit for why the
 * whole object must never be sent back.
 */
import { pickEditable } from "Utils/Common/settingsEdit";
import { settings } from "./store";

const SAVE_DELAY_MS = 300;

export const saveState = $state({
  status: "idle" as "idle" | "saving" | "saved" | "error",
  /** Saved settings that wait for an app restart, by label. */
  pendingRestart: [] as string[],
  /** Bumped on every completed save, for views that re-read live state. */
  revision: 0,
});

let baseline: string | null = null;
let queued: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> = Promise.resolve();

/** Call once the real settings arrived; edits are tracked from here on. */
export function startAutosave(loaded: Types.SettingsInterface) {
  baseline = JSON.stringify(pickEditable(loaded));
  window.figmaApi
    .invoke("getPendingRestart")
    .then((labels: string[]) => {
      saveState.pendingRestart = labels;
    })
    .catch(() => {});
}

settings.subscribe((current) => {
  if (baseline === null) return; // still the defaults placeholder
  const json = JSON.stringify(pickEditable(current));
  // Always queue the latest state, even one equal to the last save: a switch
  // flipped and flipped back must end up as it looks, and only the send knows
  // what was saved by then (an earlier change may still be in flight).
  if (json === queued) return;
  queued = json;
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY_MS);
});

function flush(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  const json = queued;
  queued = null;
  if (json === null) return inflight;

  inflight = inflight.then(async () => {
    if (json === baseline) return;
    saveState.status = "saving";
    try {
      const result: Types.SettingsSaveResult = await window.figmaApi.invoke(
        "updateSettings",
        JSON.parse(json),
      );
      baseline = json;
      saveState.pendingRestart = result.pendingRestart;
      saveState.status = "saved";
      saveState.revision++;
    } catch {
      saveState.status = "error";
    }
  });
  return inflight;
}

/** Save anything still waiting on the delay — before the view closes. */
export function flushNow(): Promise<void> {
  return flush();
}

// Main calls this before the window or the app goes away (Window.flushSettings):
// the page is torn down with the window, and a timer that hasn't fired dies with it.
(window as any).__flushSettings = flushNow;
