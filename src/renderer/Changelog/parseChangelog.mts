export interface ChangelogSection {
  category: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = markdown.split("\n");

  let current: ChangelogEntry | null = null;
  let currentSection: ChangelogSection | null = null;
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (!currentSection || buffer.length === 0) {
      buffer = [];
      return;
    }
    const joined = buffer.join(" ").trim();
    if (joined) currentSection.items.push(joined);
    buffer = [];
  };

  const flushSection = () => {
    flushBuffer();
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const versionMatch = /^##\s+\[([^\]]+)\](?:\s*-\s*(.+))?$/.exec(line);
    if (versionMatch) {
      flushSection();
      const [, version, date] = versionMatch;
      if (version.toLowerCase() === "unreleased") {
        current = null;
        continue;
      }
      current = { version, date: (date ?? "").trim(), sections: [] };
      entries.push(current);
      continue;
    }

    if (!current) continue;

    const sectionMatch = /^###\s+(.+?)\s*$/.exec(line);
    if (sectionMatch) {
      flushSection();
      currentSection = { category: sectionMatch[1].trim(), items: [] };
      current.sections.push(currentSection);
      continue;
    }

    if (!currentSection) continue;

    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      flushBuffer();
      buffer.push(bulletMatch[1]);
      continue;
    }

    if (/^\s*$/.test(line) || /^---+$/.test(line)) {
      flushBuffer();
      continue;
    }

    if (buffer.length > 0 && /^\s+/.test(rawLine)) {
      buffer.push(line.trim());
    }
  }

  flushSection();
  return entries;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isSafeUrl = (url: string): boolean => /^(https?:|mailto:)/i.test(url);

export function renderInline(markdown: string): string {
  let html = escapeHtml(markdown);

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => {
    const decoded = url.replace(/&amp;/g, "&");
    if (!isSafeUrl(decoded)) return text;
    return `<a class="cl-link" data-url="${escapeHtml(decoded)}">${text}</a>`;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/ — /g, " &mdash; ");

  return html;
}
