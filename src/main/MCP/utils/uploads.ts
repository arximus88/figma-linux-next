/**
 * upload_assets bookkeeping. The tool hands out single-use URLs on this
 * server; the client POSTs raw bytes to each, and the server places the asset
 * in the file the URL was issued for. Pure pieces live here so they can be
 * tested without HTTP or Figma.
 */
import crypto from "node:crypto";

import type { UploadTarget } from "../scripts/assets";

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TTL_MS = 10 * 60 * 1000;
export const UPLOAD_MAX_PER_CALL = 60;

export interface UploadTicket extends UploadTarget {
  fileKey: string | undefined;
  expiresAt: number;
}

const RASTER: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  "image/webp": (b) =>
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45,
};

/**
 * Check an upload's declared type against its bytes. Returns the MIME type to
 * use, or an error message. The bytes decide: a client that labels a JPEG as
 * PNG still gets it placed, but text claiming to be an image does not.
 */
export function classifyUpload(
  contentType: string | undefined,
  body: Uint8Array,
): string | { error: string } {
  if (body.length === 0) return { error: "empty body" };
  if (body.length > UPLOAD_MAX_BYTES)
    return { error: `asset is ${body.length} bytes; the limit is 10 MB` };
  const declared = (contentType ?? "").split(";")[0].trim().toLowerCase();
  for (const [mime, matches] of Object.entries(RASTER)) {
    if (matches(body)) return mime;
  }
  if (declared === "image/svg+xml") {
    const head = Buffer.from(body.subarray(0, 512)).toString("utf8").replace(/^﻿/, "").trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head))
      return "image/svg+xml";
    return { error: "body is not an SVG document" };
  }
  return {
    error: `unsupported asset (declared ${declared || "no Content-Type"}); send PNG, JPEG, GIF, WebP or SVG`,
  };
}

/** A new unguessable upload token. */
export function newUploadToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
