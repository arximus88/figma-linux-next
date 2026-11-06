/**
 * openInBrowser — #41: "Log in" in a plugin did nothing and left nothing in the
 * log, because a failed shell.openExternal was never awaited. Every hand-off
 * must now leave a line, and a failure must say why, without leaking the
 * OAuth query string into the log file.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { shell } from "electron";

const logged: string[] = [];

mock.module("Main/Logger", () => ({
  logger: {
    info: (m: string) => logged.push(`info ${m}`),
    warn: (m: string) => logged.push(`warn ${m}`),
    error: (m: string) => logged.push(`error ${m}`),
    debug: () => {},
  },
}));

const { openInBrowser } = await import("Main/openInBrowser");

const AUTH_URL = "https://linear.app/oauth/authorize?client_id=abc&state=SECRET_STATE";
const opened: string[] = [];
const originalOpenExternal = shell.openExternal;

afterAll(() => {
  (shell as any).openExternal = originalOpenExternal;
});

beforeEach(() => {
  logged.length = 0;
  opened.length = 0;
});

describe("openInBrowser", () => {
  test("hands the full URL to the browser and logs only origin and path", async () => {
    (shell as any).openExternal = async (url: string) => {
      opened.push(url);
    };

    expect(await openInBrowser(AUTH_URL, "Tab")).toBe(true);
    expect(opened).toEqual([AUTH_URL]);
    expect(logged).toEqual(["info [Tab] opening in browser: https://linear.app/oauth/authorize"]);
  });

  test("a browser that fails to start is logged with the reason (#41)", async () => {
    (shell as any).openExternal = async () => {
      throw new Error("Failed to open: xdg-open exited with 4");
    };

    expect(await openInBrowser(AUTH_URL, "Tab")).toBe(false);
    const errors = logged.filter((l) => l.startsWith("error"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("xdg-open exited with 4");
    expect(logged.join("\n")).not.toContain("SECRET_STATE");
  });

  test("a synchronous throw is caught too", async () => {
    (shell as any).openExternal = () => {
      throw new Error("boom");
    };

    expect(await openInBrowser(AUTH_URL, "MainTab")).toBe(false);
    expect(logged.join("\n")).toContain("[MainTab] could not open");
  });
});
