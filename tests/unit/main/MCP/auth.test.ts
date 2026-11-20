import { describe, expect, it } from "bun:test";
import { generateAuthToken, isAuthExempt, isAuthorized } from "Main/MCP/utils/auth";

describe("isAuthorized", () => {
  const token = "s3cr3t-Token_value";

  it("accepts the token as a bearer credential, scheme in any case", () => {
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(isAuthorized(`bearer ${token}`, token)).toBe(true);
    expect(isAuthorized(`Bearer  ${token} `, token)).toBe(true);
  });

  it("refuses a missing, wrong, truncated or extended token", () => {
    expect(isAuthorized(undefined, token)).toBe(false);
    expect(isAuthorized("", token)).toBe(false);
    expect(isAuthorized("Bearer wrong", token)).toBe(false);
    expect(isAuthorized(`Bearer ${token.slice(0, -1)}`, token)).toBe(false);
    expect(isAuthorized(`Bearer ${token}x`, token)).toBe(false);
  });

  it("refuses other schemes and malformed headers", () => {
    expect(isAuthorized(token, token)).toBe(false);
    expect(isAuthorized(`Basic ${token}`, token)).toBe(false);
    expect(isAuthorized(`Bearer ${token} extra`, token)).toBe(false);
    expect(isAuthorized("Bearer", token)).toBe(false);
    expect(isAuthorized([`Bearer ${token}`], token)).toBe(false);
  });

  it("fails closed when there is no token to compare with", () => {
    expect(isAuthorized("Bearer ", "")).toBe(false);
    expect(isAuthorized("Bearer x", "")).toBe(false);
    expect(isAuthorized("Bearer x", null)).toBe(false);
  });
});

describe("isAuthExempt", () => {
  it("lets capability URLs and CORS preflight through", () => {
    expect(isAuthExempt("POST", "/upload/abc")).toBe(true);
    expect(isAuthExempt("GET", "/assets/1234.png")).toBe(true);
    expect(isAuthExempt("OPTIONS", "/mcp")).toBe(true);
  });

  it("checks every MCP transport endpoint", () => {
    expect(isAuthExempt("POST", "/mcp")).toBe(false);
    expect(isAuthExempt("GET", "/mcp")).toBe(false);
    expect(isAuthExempt("DELETE", "/mcp")).toBe(false);
    expect(isAuthExempt("GET", "/sse")).toBe(false);
    expect(isAuthExempt("POST", "/messages?sessionId=x")).toBe(false);
    expect(isAuthExempt("POST", "/assets/x")).toBe(false);
    expect(isAuthExempt("GET", undefined)).toBe(false);
  });
});

describe("generateAuthToken", () => {
  it("makes distinct header-safe tokens of 256 bits", () => {
    const a = generateAuthToken();
    const b = generateAuthToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
