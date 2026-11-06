/**
 * Keeps a Figma tab awake while MCP tools run in it.
 *
 * A tab that is not in front (or whose window is minimized) is a hidden
 * WebContentsView: its page reports visibilityState "hidden" and gets no
 * requestAnimationFrame at all — timers still run. Figma waits for a frame
 * before exportAsync, importComponentByKeyAsync and the team-library calls
 * resolve, so get_screenshot, download_assets, list_libraries and any
 * use_figma that imports a component hung until the 60 s script timeout.
 * Measured 2026-11-06: same node, tab in front 0.1–3 s, tab behind 60 s
 * timeout; webContents.setBackgroundThrottling(false) on the hidden tab made
 * the page report "visible", frames came back and the export took 3 s;
 * setting it back to true broke it again.
 *
 * So the tab is woken for the duration of MCP work and put back to sleep once
 * the agent has been quiet for a while — not per call, since agents send a
 * burst of calls and a sleeping page needs a moment to come back. A tab that
 * was already unthrottled when we got there is left exactly as it was.
 */

export interface Throttleable {
  getBackgroundThrottling(): boolean;
  setBackgroundThrottling(allowed: boolean): void;
  isDestroyed(): boolean;
}

/** How long a woken tab stays awake after its last MCP call ends. */
export const WAKE_IDLE_MS = 60_000;
/**
 * Longest one call may hold a tab awake. executeJavaScript cannot be
 * cancelled, so a script the page never answers would otherwise keep the tab
 * awake for good (the MCP side gives up after its own 60 s timeout).
 */
export const WAKE_MAX_HOLD_MS = 5 * 60_000;

interface Held {
  active: number;
  timer?: ReturnType<typeof setTimeout>;
}

export class BackgroundWaker {
  private held = new Map<Throttleable, Held>();

  constructor(
    private idleMs = WAKE_IDLE_MS,
    private maxHoldMs = WAKE_MAX_HOLD_MS,
    private timers: {
      setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
      clearTimeout: (t: ReturnType<typeof setTimeout>) => void;
    } = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) },
  ) {}

  /** Run `work` with `wc` awake; the tab goes back to sleep `idleMs` after the last call ends. */
  public async during<T>(wc: Throttleable, work: () => Promise<T>): Promise<T> {
    this.wake(wc);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      this.timers.clearTimeout(guard);
      this.done(wc);
    };
    const guard = this.timers.setTimeout(end, this.maxHoldMs);
    try {
      return await work();
    } finally {
      end();
    }
  }

  /** Tabs currently held awake by this waker (for tests and diagnostics). */
  public get size(): number {
    return this.held.size;
  }

  private wake(wc: Throttleable): void {
    let h = this.held.get(wc);
    if (!h) {
      // Someone else turned throttling off (or it never was on): not ours to restore.
      if (wc.isDestroyed() || !wc.getBackgroundThrottling()) return;
      wc.setBackgroundThrottling(false);
      h = { active: 0 };
      this.held.set(wc, h);
    }
    if (h.timer !== undefined) {
      this.timers.clearTimeout(h.timer);
      h.timer = undefined;
    }
    h.active++;
  }

  private done(wc: Throttleable): void {
    const h = this.held.get(wc);
    if (!h) return;
    h.active = Math.max(0, h.active - 1);
    if (h.active > 0) return;
    h.timer = this.timers.setTimeout(() => this.release(wc), this.idleMs);
  }

  private release(wc: Throttleable): void {
    const h = this.held.get(wc);
    if (!h || h.active > 0) return;
    this.held.delete(wc);
    if (!wc.isDestroyed()) wc.setBackgroundThrottling(true);
  }
}
