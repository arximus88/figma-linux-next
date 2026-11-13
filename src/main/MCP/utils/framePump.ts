/**
 * Keeps animation frames coming to a tab while an MCP script runs in it.
 *
 * Figma's exports and library imports wait for a requestAnimationFrame. A
 * page gets frames only while the desktop draws its window: with the screen
 * locked or off, GNOME sends none, even to the tab in front, and
 * get_screenshot sat until the 60 s timeout (measured 2026-11-13, GNOME 51,
 * Electron 45). BackgroundWaker does not help there: it makes a hidden tab
 * count as visible, but a visible page without a drawn window still has no
 * frames.
 *
 * capturePage() makes the compositor produce a frame for the page whether or
 * not the window is being drawn, and the page's rAF callbacks run with it.
 * Same machine, screen locked, tab in the background: without the pump the
 * export never returned, with a 1x1 capture every 250 ms it took 0.3 s. Once
 * the pump stops the page is back to no frames.
 *
 * A script that answers quickly never starts the pump, so ordinary reads
 * cost nothing.
 */

export interface FrameSource {
  capturePage(
    rect: { x: number; y: number; width: number; height: number },
    opts: { stayHidden: boolean },
  ): Promise<unknown>;
  isDestroyed(): boolean;
}

/** A script still running after this long gets frames pumped. */
export const PUMP_AFTER_MS = 300;
/** One forced frame per interval: enough for Figma's "wait a frame" steps. */
export const PUMP_EVERY_MS = 250;

const ONE_PIXEL = { x: 0, y: 0, width: 1, height: 1 };

interface Timers {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (t: ReturnType<typeof setTimeout>) => void;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (t: ReturnType<typeof setInterval>) => void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (t) => clearInterval(t),
};

/** Run `work`, pumping frames into `wc` for as long as it is still running after PUMP_AFTER_MS. */
export async function withFrames<T>(
  wc: FrameSource,
  work: () => Promise<T>,
  timers: Timers = realTimers,
): Promise<T> {
  let interval: ReturnType<typeof setInterval> | undefined;
  const pump = () => {
    if (wc.isDestroyed()) return;
    // stayHidden: the page must not start counting as shown because of us.
    // A capture can fail (view mid-teardown); the next tick tries again.
    wc.capturePage(ONE_PIXEL, { stayHidden: true }).catch(() => {});
  };
  const start = timers.setTimeout(() => {
    pump();
    interval = timers.setInterval(pump, PUMP_EVERY_MS);
  }, PUMP_AFTER_MS);
  try {
    return await work();
  } finally {
    timers.clearTimeout(start);
    if (interval !== undefined) timers.clearInterval(interval);
  }
}
