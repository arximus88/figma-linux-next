import { describe, expect, it } from "bun:test";
import { isSameCookieDomain } from "Utils/Main/cookies";

describe("cookies utils", () => {
  describe("isSameCookieDomain", () => {
    it("returns false for empty cookie domain", () => {
      expect(isSameCookieDomain("", "figma.com")).toBe(false);
    });

    it("returns true when domains are exactly the same", () => {
      expect(isSameCookieDomain("figma.com", "figma.com")).toBe(true);
      expect(isSameCookieDomain("sub.figma.com", "sub.figma.com")).toBe(true);
    });

    it("returns true when cookie domain has a leading dot and hostname matches root", () => {
      expect(isSameCookieDomain(".figma.com", "figma.com")).toBe(true);
    });

    it("returns false when hostname is a subdomain of the cookie domain without leading dot", () => {
      expect(isSameCookieDomain("figma.com", "www.figma.com")).toBe(false);
      expect(isSameCookieDomain("figma.com", "sub.www.figma.com")).toBe(false);
    });

    it("returns true when cookie domain has leading dot and hostname is a subdomain", () => {
      expect(isSameCookieDomain(".figma.com", "www.figma.com")).toBe(true);
    });

    it("returns false for completely different domains", () => {
      expect(isSameCookieDomain("figma.com", "google.com")).toBe(false);
      expect(isSameCookieDomain("google.com", "figma.com")).toBe(false);
    });

    it("returns true when cookie domain is a subdomain of the hostname", () => {
      expect(isSameCookieDomain("www.figma.com", "figma.com")).toBe(true);
    });

    it("returns false when subdomains do not match", () => {
      expect(isSameCookieDomain("app.figma.com", "www.figma.com")).toBe(false);
    });
  });
});
