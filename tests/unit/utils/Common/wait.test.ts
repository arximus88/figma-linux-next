import { describe, expect, test, spyOn } from "bun:test";
import { wait } from "Utils/Common/wait";

describe("wait utility", () => {
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
