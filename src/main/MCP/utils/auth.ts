/**
 * auth.ts — optional bearer-token check for the MCP server (issue #94).
 *
 * The server binds to 127.0.0.1 and refuses foreign browser origins, but any
 * local process (another user's session on a shared machine, a container
 * with host networking, a stray script) could still call it. With
 * `mcp.requireAuth` on, every request must carry
 * `Authorization: Bearer <mcp.authToken>`.
 *
 * Pure functions, so the rules are unit-tested without HTTP.
 */

import crypto from "node:crypto";

/** 32 random bytes, base64url: 43 characters, safe in a header and a shell. */
export function generateAuthToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Paths that skip the bearer check because the URL itself is the credential:
 *
 * - `POST /upload/<token>`: `upload_assets` hands out a single-use, 192-bit
 *   token that expires in 10 minutes, and only to a client that already passed
 *   this check. The client POSTs with curl or a script, which does not know
 *   the MCP client's headers.
 * - `GET /assets/<uuid>`: images a tool exported, linked from its answer by a
 *   random UUID. Agents fetch them with plain HTTP tools for the same reason.
 * - `OPTIONS`: CORS preflight; browsers never attach Authorization to it.
 */
export function isAuthExempt(method: string | undefined, url: string | undefined): boolean {
  if (method === "OPTIONS") return true;
  if (!url) return false;
  if (url.startsWith("/upload/")) return true;
  if (method === "GET" && url.startsWith("/assets/")) return true;
  return false;
}

/**
 * Does the Authorization header carry `expected`?
 *
 * `expected` null or empty means auth is off or no token exists yet. The
 * second case fails closed: a hand-edited settings.json with requireAuth on
 * and no token must not leave the server open.
 *
 * Both sides are hashed before timingSafeEqual, which needs equal lengths and
 * would otherwise leak the token's length through an early return.
 */
export function isAuthorized(
  header: string | string[] | undefined,
  expected: string | null,
): boolean {
  if (!expected) return false;
  if (typeof header !== "string") return false;
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
  if (!match) return false;
  const given = crypto.createHash("sha256").update(match[1]).digest();
  const want = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(given, want);
}
