/**
 * Shape of Figma's `setTabPreviewData` message, as observed on 2026-09-08:
 *
 *   { data: { editedAt: "2026-03-10T20:05:02Z",
 *             thumbnail: { url: "https://s3-alpha.figma.com/thumbnails/…?X-Amz-…",
 *                          backgroundColor: "rgba(245, 245, 245, 1)", fullWidth: false } } }
 *
 * Only an https thumbnail is accepted — the card renders it straight into an
 * <img>, so a data: or javascript: URL from a compromised page must not get
 * through. Returns null when there is nothing usable.
 */
export function normalizeTabPreviewData(raw: unknown): Types.TabPreviewData | null {
  const data = (raw as { data?: unknown } | null)?.data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const thumb = d.thumbnail as Record<string, unknown> | undefined;
  const url = typeof thumb?.url === "string" ? thumb.url : null;
  if (!url || !/^https:\/\//i.test(url)) return null;

  const out: Types.TabPreviewData = { thumbnailUrl: url };
  if (typeof thumb?.backgroundColor === "string") out.backgroundColor = thumb.backgroundColor;
  if (typeof thumb?.fullWidth === "boolean") out.fullWidth = thumb.fullWidth;
  if (typeof d.editedAt === "string" && !Number.isNaN(Date.parse(d.editedAt))) {
    out.editedAt = d.editedAt;
  }
  return out;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago" / "just now" for the card's meta line. Empty string when unparsable. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return rtf.format(-Math.round(seconds / size), unit);
  }
  return "just now";
}
