/**
 * http.ts — Low-level HTTP response helpers for the MCP server.
 *
 * Pure functions extracted from McpServer.ts (Phase 4 of decomposition);
 * no behavior change.
 */

import type http from "node:http";

/**
 * CORS headers shared by every response. `Access-Control-Allow-Origin` is not
 * here: the request guard in McpServer echoes it per request, and only for a
 * loopback origin (see isAllowedOrigin). A wildcard let any web page the user
 * visited drive the server through their browser.
 * See: https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
 */
export function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...cors(),
  });
  res.end(body);
}

/**
 * Sends a JSON-RPC 2.0 error response.
 * See: https://www.jsonrpc.org/specification#error_object
 */
export function replyError(
  res: http.ServerResponse,
  httpCode: number,
  rpcCode: number,
  msg: string,
  reqId: string | number | null = null,
): void {
  sendJson(res, httpCode, {
    jsonrpc: "2.0",
    error: { code: rpcCode, message: msg },
    id: reqId,
  });
}

/**
 * Collects the full request body as a UTF-8 string.
 * Uses for-await-of on the native readable stream.
 */
export async function collectBody(req: http.IncomingMessage): Promise<string> {
  const parts: string[] = [];
  req.setEncoding("utf8");
  for await (const chunk of req) {
    parts.push(chunk as string);
  }
  return parts.join("");
}

/** Validates the Host header allows only loopback addresses. */
export function isValidHost(hostHeader: string): boolean {
  let hostname: string;
  try {
    // URL constructor reliably parses host:port combinations
    const parsed = new URL(`http://${hostHeader}`);
    hostname = parsed.hostname;
  } catch {
    return false;
  }
  return isLoopbackHostname(hostname);
}

/** URL.hostname keeps the brackets for IPv6, so the loopback comes through as "[::1]". */
function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "localhost"
  );
}

/**
 * Who may talk to the MCP server, judged by the Origin header.
 *
 * - No Origin: a CLI or desktop MCP client (Node, Go, Python). Browsers always
 *   send Origin on cross-origin fetches and on every POST, so a web page can't
 *   hide it.
 * - A loopback http(s) origin: browser-based local tools such as the MCP
 *   Inspector on localhost.
 * - Anything else, including "null" (sandboxed iframes, file://): refused.
 *   Otherwise any site the user opens could read their open designs, and
 *   with write tools on, change them.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return isLoopbackHostname(parsed.hostname);
}
