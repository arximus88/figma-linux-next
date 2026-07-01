/**
 * SessionManager.ts — MCP session lifecycle.
 *
 * Owns the live session map and the idle-session reaper. Extracted from
 * McpServer.ts (Phase 6 of decomposition); behavior preserved, including the
 * 30-minute idle TTL swept every 5 minutes.
 */

import crypto from "node:crypto";
import type { Logger, McpSession } from "../types";

const IDLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class SessionManager {
  private sessions = new Map<string, McpSession>();
  private reaper: ReturnType<typeof setInterval> | null = null;

  constructor(private log: Logger) {}

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  get(id: string): McpSession | undefined {
    return this.sessions.get(id);
  }

  /** Insert or replace a session (keyed by its own id). */
  set(session: McpSession): void {
    this.sessions.set(session.id, session);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  /** Iterate live sessions (e.g. to broadcast notifications). */
  values(): IterableIterator<McpSession> {
    return this.sessions.values();
  }

  /** Create, store, and return a new session with a random id. */
  create(clientInfo?: McpSession["clientInfo"]): McpSession {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: McpSession = {
      id,
      createdAt: now,
      lastActivity: now,
      sseResponse: null,
      clientInfo,
    };
    this.sessions.set(id, session);
    return session;
  }

  /** Bump last-activity so the reaper doesn't evict an active session. */
  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.lastActivity = Date.now();
  }

  /** Begin reaping sessions idle for longer than the TTL. */
  startReaper(): void {
    this.reaper = setInterval(() => {
      const cutoff = Date.now() - IDLE_TTL_MS;
      for (const [id, session] of this.sessions) {
        if (session.lastActivity < cutoff) {
          this.endSse(session);
          this.sessions.delete(id);
          this.log.info("Session reaped (idle 30m):", id);
        }
      }
    }, SWEEP_INTERVAL_MS);
  }

  /** Close every session's SSE stream, clear the map, and stop the reaper. */
  shutdown(): void {
    for (const [id, session] of this.sessions) {
      this.endSse(session);
      this.sessions.delete(id);
    }
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = null;
    }
  }

  private endSse(session: McpSession): void {
    if (session.sseResponse) {
      try {
        session.sseResponse.end();
      } catch {
        /* ignore */
      }
    }
  }
}
