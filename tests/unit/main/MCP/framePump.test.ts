/**
 * Frames for a tab whose window the desktop is not drawing (screen locked).
 * Measured live: without them an export never returned; see framePump.ts.
 */

import { describe, expect, test } from "bun:test";
import { PUMP_AFTER_MS, PUMP_EVERY_MS, withFrames } from "Main/MCP/utils/framePump";

/** Timers driven by hand. */
function clock() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map<number, { at: number; every?: number; fn: () => void }>();
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        jobs.set(nextId, { at: now + ms, fn });
        return nextId++ as any;
      },
      clearTimeout: (id: any): void => {
        jobs.delete(id);
      },
      setInterval: (fn: () => void, ms: number) => {
        jobs.set(nextId, { at: now + ms, every: ms, fn });
        return nextId++ as any;
      },
      clearInterval: (id: any): void => {
        jobs.delete(id);
      },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, j]) => j.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, job] = due;
        now = job.at;
        if (job.every) job.at += job.every;
        else jobs.delete(id);
        job.fn();
      }
      now = end;
    },
    pending: () => jobs.size,
  };
}

function page(opts: { destroyed?: boolean; failing?: boolean } = {}) {
  const captures: { rect: any; opts: any }[] = [];
  return {
    captures,
    wc: {
      isDestroyed: () => !!opts.destroyed,
      capturePage: (rect: any, o: any) => {
        captures.push({ rect, opts: o });
        return opts.failing ? Promise.reject(new Error("UnknownVizError")) : Promise.resolve();
      },
    },
  };
}

describe("withFrames", () => {
  test("a script that answers quickly never captures anything", async () => {
    const c = clock();
    const p = page();

    const result = await withFrames(p.wc, async () => "done", c.timers);
    c.advance(5_000);

    expect(result).toBe("done");
    expect(p.captures).toHaveLength(0);
    expect(c.pending()).toBe(0);
  });

  test("a slow script gets one tiny capture per interval until it ends, then none", async () => {
    const c = clock();
    const p = page();
    let finish!: (v: string) => void;
    const running = withFrames(p.wc, () => new Promise<string>((r) => (finish = r)), c.timers);

    c.advance(PUMP_AFTER_MS - 1);
    expect(p.captures).toHaveLength(0);
    c.advance(1);
    expect(p.captures).toHaveLength(1);
    c.advance(PUMP_EVERY_MS * 3);
    expect(p.captures).toHaveLength(4);
    // One pixel, and the page must not start counting as shown.
    expect(p.captures[0]).toEqual({
      rect: { x: 0, y: 0, width: 1, height: 1 },
      opts: { stayHidden: true },
    });

    finish("exported");
    expect(await running).toBe("exported");
    c.advance(10_000);
    expect(p.captures).toHaveLength(4);
    expect(c.pending()).toBe(0);
  });

  test("the pump stops when the script fails, and a failing capture does not break the script", async () => {
    const c = clock();
    const failing = page({ failing: true });
    let reject!: (e: Error) => void;
    const running = withFrames(failing.wc, () => new Promise((_, r) => (reject = r)), c.timers);
    c.advance(PUMP_AFTER_MS + PUMP_EVERY_MS);
    expect(failing.captures.length).toBe(2);

    reject(new Error("Node not found"));
    await expect(running).rejects.toThrow("Node not found");
    c.advance(10_000);
    expect(failing.captures.length).toBe(2);
  });

  test("a closed tab is left alone", async () => {
    const c = clock();
    const gone = page({ destroyed: true });
    let finish!: () => void;
    const running = withFrames(gone.wc, () => new Promise<void>((r) => (finish = r)), c.timers);
    c.advance(PUMP_AFTER_MS + PUMP_EVERY_MS * 4);
    finish();
    await running;
    expect(gone.captures).toHaveLength(0);
  });
});
