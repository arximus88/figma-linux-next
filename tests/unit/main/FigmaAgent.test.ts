import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import net from "node:net";
import {
  FIGMA_AGENT_VERSION,
  type FigmaAgentHooks,
  FigmaAgentServer,
  isFigmaOrigin,
  routeAgentRequest,
} from "Main/FigmaAgent";

/**
 * The protocol figma.com speaks to the official desktop helper, as read out of
 * the production bundle (see the header of src/main/FigmaAgent.ts). The
 * routing is pure and tested directly; the server is driven once over a real
 * socket to pin the headers a browser needs.
 */

const FIGMA = "https://www.figma.com";

function hooks(known: string[] = ["42"]): FigmaAgentHooks & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    isKnownUser: (id) => known.includes(id),
    openUrl: (url) => opened.push(url),
  };
}

describe("isFigmaOrigin", () => {
  it("accepts figma.com and its subdomains over https only", () => {
    expect(isFigmaOrigin("https://www.figma.com")).toBe(true);
    expect(isFigmaOrigin("https://figma.com")).toBe(true);
    expect(isFigmaOrigin("https://staging.figma.com")).toBe(true);
    expect(isFigmaOrigin("http://www.figma.com")).toBe(false);
    expect(isFigmaOrigin("https://www.figma.com.evil.example")).toBe(false);
    expect(isFigmaOrigin("https://notfigma.com")).toBe(false);
    expect(isFigmaOrigin(undefined)).toBe(false);
  });
});

describe("routeAgentRequest", () => {
  it("answers nothing without a figma.com Origin — a GET needs no preflight", () => {
    const h = hooks();
    const url = `/figma/desktop/open-url?userID=42&url=${encodeURIComponent(`${FIGMA}/design/k/n`)}`;
    expect(routeAgentRequest({ method: "GET", url }, h).status).toBe(403);
    expect(
      routeAgentRequest({ method: "GET", url, origin: "https://evil.example" }, h).status,
    ).toBe(403);
    expect(
      routeAgentRequest({ method: "OPTIONS", url, origin: "https://evil.example" }, h).status,
    ).toBe(403);
    expect(h.opened).toEqual([]);
  });

  it("reports a version the page accepts the preference push for", () => {
    const reply = routeAgentRequest(
      { method: "GET", url: "/figma/version", origin: FIGMA },
      hooks(),
    );
    expect(reply).toEqual({ status: 200, body: { version: FIGMA_AGENT_VERSION } });
    expect(FIGMA_AGENT_VERSION).toBeGreaterThanOrEqual(24);
  });

  it("can-open-url is yes only for an account signed in here, asked from figma.com", () => {
    const ask = (userID: string, origin = FIGMA) =>
      routeAgentRequest(
        {
          method: "GET",
          url: `/figma/desktop/can-open-url?userID=${userID}&url=${encodeURIComponent(origin)}`,
          origin: FIGMA,
        },
        hooks(["42"]),
      ).body;
    expect(ask("42")).toEqual({ canOpen: true });
    expect(ask("7")).toEqual({ canOpen: false });
    expect(ask("")).toEqual({ canOpen: false });
    expect(ask("42", "https://evil.example")).toEqual({ canOpen: false });
  });

  it("open-url opens a figma.com link for a known account and says so", () => {
    const h = hooks(["42"]);
    const link = `${FIGMA}/design/AbC123/My-file?node-id=1-2&fuid=42&editor_type=design`;
    const reply = routeAgentRequest(
      {
        method: "GET",
        url: `/figma/desktop/open-url?userID=42&url=${encodeURIComponent(link)}`,
        origin: FIGMA,
      },
      h,
    );
    expect(reply).toEqual({ status: 200, body: { opened: true } });
    expect(h.opened).toEqual([link]);
  });

  it("open-url refuses an unknown account and anything that is not a figma.com https link", () => {
    const h = hooks(["42"]);
    const open = (userID: string, link: string) =>
      routeAgentRequest(
        {
          method: "GET",
          url: `/figma/desktop/open-url?userID=${userID}&url=${encodeURIComponent(link)}`,
          origin: FIGMA,
        },
        h,
      ).body;
    expect(open("7", `${FIGMA}/design/k/n`)).toEqual({ opened: false });
    expect(open("42", "https://evil.example/design/k/n")).toEqual({ opened: false });
    expect(open("42", "http://www.figma.com/design/k/n")).toEqual({ opened: false });
    expect(open("42", "figma://design/k/n")).toEqual({ opened: false });
    expect(open("42", "")).toEqual({ opened: false });
    expect(open("42", "https://wfigma.com/design/k/n")).toEqual({ opened: false });
    expect(open("42", "https://figma.com@evil.example/design/k/n")).toEqual({ opened: false });
    expect(open("42", "https://user:password@www.figma.com/design/k/n")).toEqual({ opened: false });
    expect(h.opened).toEqual([]);
  });

  it("acknowledges the preference push and 404s the rest of the real agent", () => {
    const h = hooks();
    expect(
      routeAgentRequest(
        { method: "POST", url: "/figma/desktop/set-open-in-desktop-app-pref", origin: FIGMA },
        h,
      ),
    ).toEqual({ status: 200, body: {} });
    expect(
      routeAgentRequest({ method: "GET", url: "/figma/font-files?isolate=true&", origin: FIGMA }, h)
        .status,
    ).toBe(404);
    expect(
      routeAgentRequest({ method: "OPTIONS", url: "/figma/version", origin: FIGMA }, h).status,
    ).toBe(204);
  });
});

/** Bind an ephemeral port, then release it so the agent can claim it. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

const silent = { info() {}, warn() {}, error() {} };

describe("FigmaAgentServer", () => {
  let server: FigmaAgentServer;
  let h: ReturnType<typeof hooks>;
  let base: string;
  let port: number;

  beforeEach(async () => {
    h = hooks(["42"]);
    server = new FigmaAgentServer(h, silent);
    port = await getFreePort();
    expect(await server.start(port, "127.0.0.1")).toBe(true);
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  it("serves JSON with CORS for the figma.com origin that asked", async () => {
    const res = await fetch(`${base}/figma/version`, {
      headers: { Origin: FIGMA, "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe(FIGMA);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-private-network")).toBe("true");
    expect(await res.json()).toEqual({ version: FIGMA_AGENT_VERSION });
    expect(server.getStatus()).toEqual({ listening: true, port, portInUse: false });
  });

  it("answers the JSON preflight the preference POST needs, then the POST", async () => {
    const pre = await fetch(`${base}/figma/desktop/set-open-in-desktop-app-pref`, {
      method: "OPTIONS",
      headers: {
        Origin: FIGMA,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("POST");
    expect(pre.headers.get("access-control-allow-headers")).toContain("Content-Type");

    const post = await fetch(`${base}/figma/desktop/set-open-in-desktop-app-pref`, {
      method: "POST",
      headers: { Origin: FIGMA, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${FIGMA}/design/k/n`, userOpenInAppPrefs: { "42": true } }),
    });
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({});
  });

  it("hands a file link to the app over the wire", async () => {
    const link = `${FIGMA}/design/AbC123/My-file?node-id=1-2`;
    const res = await fetch(
      `${base}/figma/desktop/open-url?userID=42&url=${encodeURIComponent(link)}`,
      { headers: { Origin: FIGMA } },
    );
    expect(await res.json()).toEqual({ opened: true });
    expect(h.opened).toEqual([link]);
  });

  it("refuses a foreign origin and a non-loopback Host without CORS headers", async () => {
    const foreign = await fetch(`${base}/figma/version`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();

    const rebound = await fetch(`${base}/figma/version`, {
      headers: { Origin: FIGMA, Host: "agent.evil.example" },
    });
    expect(rebound.status).toBe(403);
  });

  it("serializes overlapping starts and releases a listener stopped during startup", async () => {
    await server.stop();
    const first = server.start(port);
    const second = server.start(port);
    const stopped = server.stop();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    await stopped;
    expect(server.getStatus().listening).toBe(false);
    await expect(fetch(`${base}/figma/version`, { headers: { Origin: FIGMA } })).rejects.toThrow();
    expect(await server.start(port)).toBe(true);
  });

  it("an application hook error returns 500 without taking down the listener", async () => {
    h.openUrl = () => {
      throw new Error("window unavailable");
    };
    const res = await fetch(
      `${base}/figma/desktop/open-url?userID=42&url=${encodeURIComponent(`${FIGMA}/design/k/n`)}`,
      { headers: { Origin: FIGMA } },
    );
    expect(res.status).toBe(500);
    expect((await fetch(`${base}/figma/version`, { headers: { Origin: FIGMA } })).status).toBe(200);
  });

  it("reports a busy port instead of throwing, and a stopped server as not listening", async () => {
    const other = new FigmaAgentServer(h, silent);
    expect(await other.start(port, "127.0.0.1")).toBe(false);
    expect(other.getStatus()).toEqual({ listening: false, port, portInUse: true });

    await server.stop();
    expect(server.getStatus().listening).toBe(false);
    await expect(fetch(`${base}/figma/version`, { headers: { Origin: FIGMA } })).rejects.toThrow();
  });
});
