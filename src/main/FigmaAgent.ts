/**
 * FigmaAgent.ts — the local helper figma.com looks for in a browser.
 *
 * figma.com in a normal browser never uses figma:// to hand a file to the
 * desktop app. It probes a small HTTP service the official app installs (the
 * "FigmaAgent" font helper) at http://127.0.0.1:44950/figma/... and, when it
 * answers, shows "Open in desktop app" in the main menu, offers the "Open
 * links in desktop app" preference, and redirects file links on load once that
 * preference is on. The page's platform check already includes Linux — only
 * the helper was missing. Read out of the production bundle on 2026-10-11;
 * the three calls the hand-off needs are:
 *
 *   GET  /figma/version                                    → { version }
 *   GET  /figma/desktop/can-open-url?userID=&url=<origin>  → { canOpen }
 *   GET  /figma/desktop/open-url?userID=&url=<file url>    → { opened }
 *   POST /figma/desktop/set-open-in-desktop-app-pref       → {}   (JSON, sent to version >= 24)
 *
 * Requests are honoured only from a figma.com origin: a browser always sends
 * Origin on a cross-origin fetch, and the open-url GET is a "simple" request
 * that any page could fire without a preflight. Only https figma.com URLs are
 * opened, and only for an account that is signed in here, which is what the
 * official helper's "same account" rule amounts to. The rest of the real
 * agent's surface (font files, updates) is not served; the page treats a
 * missing endpoint as "no local fonts" and carries on.
 */

import http from "node:http";

import { logger } from "Main/Logger";
import { isValidHost } from "Main/MCP/utils/http";

export const FIGMA_AGENT_PORT = 44950;
export const FIGMA_AGENT_HOST = "127.0.0.1";
/**
 * What /figma/version reports. The page pushes the "open links in desktop
 * app" preference only to an agent at 24 or newer; nothing else in the bundle
 * compares the number.
 */
export const FIGMA_AGENT_VERSION = 24;

export interface FigmaAgentHooks {
  /** Is this Figma user id signed in to the app? */
  isKnownUser(userId: string): boolean;
  /** Open a figma.com URL in the app and bring a window up. */
  openUrl(url: string): void;
}

export interface AgentLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface AgentRequest {
  method: string;
  url: string;
  origin?: string;
}

export interface AgentReply {
  status: number;
  body?: unknown;
}

const FIGMA_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*figma\.com$/i;

export function isFigmaOrigin(origin: string | undefined): origin is string {
  return typeof origin === "string" && FIGMA_ORIGIN.test(origin);
}

/** CORS for the one origin we answer. Credentials are allowed so the page's
 *  fetch mode does not matter; a cookie for 127.0.0.1 carries nothing. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Chromium's private-network-access preflight; harmless where unused.
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/**
 * Decide the answer to one request. Everything observable about the protocol
 * lives here so it can be unit-tested without a socket; the server below only
 * moves bytes.
 */
export function routeAgentRequest(req: AgentRequest, hooks: FigmaAgentHooks): AgentReply {
  if (!isFigmaOrigin(req.origin)) return { status: 403, body: { error: "origin not allowed" } };
  if (req.method === "OPTIONS") return { status: 204 };

  let url: URL;
  try {
    url = new URL(req.url, `http://${FIGMA_AGENT_HOST}`);
  } catch {
    return { status: 400, body: { error: "bad request" } };
  }
  const userId = url.searchParams.get("userID") ?? "";
  const target = url.searchParams.get("url") ?? "";
  const known = userId !== "" && hooks.isKnownUser(userId);

  if (req.method === "GET" && url.pathname === "/figma/version") {
    return { status: 200, body: { version: FIGMA_AGENT_VERSION } };
  }
  if (req.method === "GET" && url.pathname === "/figma/desktop/can-open-url") {
    // `url` is the page's origin, not a file link.
    return { status: 200, body: { canOpen: known && isFigmaOrigin(target) } };
  }
  if (req.method === "GET" && url.pathname === "/figma/desktop/open-url") {
    let allowedTarget = false;
    try {
      const parsed = new URL(target);
      allowedTarget = isFigmaOrigin(parsed.origin) && !parsed.username && !parsed.password;
    } catch {
      // Invalid URLs are refused like an unknown account.
    }
    const opened = known && allowedTarget;
    if (opened) hooks.openUrl(target);
    return { status: 200, body: { opened } };
  }
  if (req.method === "POST" && url.pathname === "/figma/desktop/set-open-in-desktop-app-pref") {
    // The preference lives on Figma's servers and the page enforces it; the
    // real agent only mirrors it. Acknowledge so the page does not warn.
    return { status: 200, body: {} };
  }
  return { status: 404, body: { error: "not found" } };
}

export class FigmaAgentServer {
  private server: http.Server | null = null;
  private listening = false;
  private portInUse = false;
  private boundPort = FIGMA_AGENT_PORT;
  private lifecycle: Promise<void> = Promise.resolve();

  constructor(
    private hooks: FigmaAgentHooks,
    private log: AgentLogger = logger,
  ) {}

  public getStatus(): Types.FigmaAgentStatus {
    return { listening: this.listening, port: this.boundPort, portInUse: this.portInUse };
  }

  /** Bind the listener. Resolves false when the port is taken or binding fails. */
  public start(port = FIGMA_AGENT_PORT, host = FIGMA_AGENT_HOST): Promise<boolean> {
    const result = this.lifecycle.then(() => this.startListener(port, host));
    this.lifecycle = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private startListener(port: number, host: string): Promise<boolean> {
    if (this.listening) return Promise.resolve(true);
    this.boundPort = port;

    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        try {
          this.handle(req, res);
        } catch (error) {
          this.log.error("[FigmaAgent] Request failed:", error);
          if (res.headersSent) res.destroy();
          else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "request failed" }));
          }
        }
      });
      server.on("error", (err: NodeJS.ErrnoException) => {
        this.portInUse = err.code === "EADDRINUSE";
        if (this.portInUse) {
          this.log.warn(`[FigmaAgent] Port ${port} already in use — browser hand-off unavailable`);
        } else {
          this.log.error("[FigmaAgent] Server error:", err);
        }
        server.removeAllListeners();
        if (this.server === server) this.server = null;
        this.listening = false;
        resolve(false);
      });
      server.listen(port, host, () => {
        this.server = server;
        this.listening = true;
        this.portInUse = false;
        this.log.info(`[FigmaAgent] Listening at http://${host}:${port}/figma`);
        resolve(true);
      });
    });
  }

  /** Close the listener and resolve once the port is released. */
  public stop(): Promise<void> {
    const result = this.lifecycle.then(() => this.stopListener());
    this.lifecycle = result.catch(() => {});
    return result;
  }

  private stopListener(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.listening = false;
    this.portInUse = false;
    if (!server) return Promise.resolve();
    return new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => {
        this.log.info("[FigmaAgent] Stopped");
        resolve();
      });
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    // The preference body is unused. Drain without retaining it in memory.
    req.resume();
    const host = req.headers.host;
    if (!host || !isValidHost(host)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const origin = req.headers.origin;

    const reply = routeAgentRequest(
      { method: req.method ?? "GET", url: req.url ?? "/", origin },
      this.hooks,
    );
    const headers: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      ...(isFigmaOrigin(origin) ? corsHeaders(origin) : {}),
    };
    if (reply.body === undefined) {
      res.writeHead(reply.status, headers);
      res.end();
      return;
    }
    res.writeHead(reply.status, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify(reply.body));
  }
}
