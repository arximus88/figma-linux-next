import { describe, expect, test, spyOn } from "bun:test";
import { wait } from "./wait";

describe("wait utility", () => {
  test("should resolve after at least the specified duration", async () => {
    const ms = 50;
    const start = Date.now();
    await wait(ms);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(ms);
  });

  test("should call setTimeout with the correct duration", async () => {
    const ms = 100;
    const spy = spyOn(globalThis, "setTimeout");

    const waitPromise = wait(ms);

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][1]).toBe(ms);

    await waitPromise;
    spy.mockRestore();
  });
});
