/**
 * BackgroundWaker: a tab behind another one gets no animation frames, and
 * Figma's exports and library imports wait for one (measured 2026-11-06), so
 * MCP work wakes the tab and lets it sleep again once the agent goes quiet.
 */

import { describe, expect, it } from "bun:test";

import { BackgroundWaker } from "Main/MCP/utils/backgroundWaker";

function fakeTab(throttled = true) {
  const calls: boolean[] = [];
  return {
    calls,
    destroyed: false,
    throttled,
    getBackgroundThrottling() {
      return this.throttled;
    },
    setBackgroundThrottling(v: boolean) {
      calls.push(v);
      this.throttled = v;
    },
    isDestroyed() {
      return this.destroyed;
    },
  };
}

function manualTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  return {
    pending,
    timers: {
      setTimeout: (fn: () => void) => {
        pending.set(++id, fn);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (t: ReturnType<typeof setTimeout>) => {
        pending.delete(t as unknown as number);
      },
    },
    fire() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
  };
}

describe("BackgroundWaker", () => {
  it("keeps a background tab awake during the call and puts it back to sleep after the idle delay", async () => {
    const tab = fakeTab();
    const t = manualTimers();
    const waker = new BackgroundWaker(60_000, 300_000, t.timers);
    let awakeInside: boolean | null = null;
    await waker.during(tab, async () => {
      awakeInside = !tab.throttled;
    });
    expect(awakeInside).toBe(true);
    // Still awake right after: the next call of the burst should not wait for the page to wake.
    expect(tab.throttled).toBe(false);
    t.fire();
    expect(tab.throttled).toBe(true);
    expect(tab.calls).toEqual([false, true]);
    expect(waker.size).toBe(0);
  });

  it("wakes once for a burst of calls and restarts the idle delay on each", async () => {
    const tab = fakeTab();
    const t = manualTimers();
    const waker = new BackgroundWaker(60_000, 300_000, t.timers);
    await waker.during(tab, async () => {});
    await waker.during(tab, async () => {});
    // One idle timer left (each call's hold guard was cleared when it ended).
    expect(t.pending.size).toBe(1);
    t.fire();
    expect(tab.calls).toEqual([false, true]);
  });

  it("does not put a tab to sleep while another call in it is still running", async () => {
    const tab = fakeTab();
    const t = manualTimers();
    const waker = new BackgroundWaker(60_000, 300_000, t.timers);
    let finishLong!: () => void;
    const long = waker.during(tab, () => new Promise<void>((r) => (finishLong = r)));
    await waker.during(tab, async () => {});
    // The short call ended, but the long one holds the tab: only its hold guard is pending.
    expect(t.pending.size).toBe(1);
    expect(tab.throttled).toBe(false);
    finishLong();
    await long;
    t.fire();
    expect(tab.throttled).toBe(true);
  });

  it("leaves a tab alone that was already unthrottled", async () => {
    const tab = fakeTab(false);
    const t = manualTimers();
    const waker = new BackgroundWaker(60_000, 300_000, t.timers);
    await waker.during(tab, async () => {});
    t.fire();
    expect(tab.calls).toEqual([]);
    expect(tab.throttled).toBe(false);
  });

  it("puts the tab back to sleep when the call fails too, and ignores a closed tab", async () => {
    const tab = fakeTab();
    const t = manualTimers();
    const waker = new BackgroundWaker(60_000, 300_000, t.timers);
    await expect(
      waker.during(tab, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    tab.destroyed = true;
    t.fire();
    expect(tab.calls).toEqual([false]);
    expect(waker.size).toBe(0);
  });

  it("lets the tab sleep after the hold limit when the page never answers", async () => {
    const tab = fakeTab();
    const t = manualTimers();
    const waker = new BackgroundWaker(60_000, 300_000, t.timers);
    void waker.during(tab, () => new Promise<void>(() => {}));
    await Promise.resolve();
    t.fire(); // the 5-minute hold guard ends the call's hold and arms the idle timer
    t.fire(); // the idle timer puts the tab back to sleep
    expect(tab.throttled).toBe(true);
    expect(waker.size).toBe(0);
  });
});
