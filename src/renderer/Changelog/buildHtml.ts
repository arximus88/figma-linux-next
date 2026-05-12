import { parseChangelog, renderInline, type ChangelogEntry } from "./parseChangelog";

const categoryClass = (category: string) =>
  "section-" + category.toLowerCase().replace(/\W+/g, "-");

function renderEntry(entry: ChangelogEntry): string {
  const sections = entry.sections
    .map((s) => {
      const items = s.items.map((i) => `<li>${renderInline(i)}</li>`).join("");
      return `<h3 class="section ${categoryClass(s.category)}">${s.category}</h3><ul>${items}</ul>`;
    })
    .join("");

  const date = entry.date ? `<span class="date">${entry.date}</span>` : "";

  return `<section class="entry"><h2><span class="version">v${entry.version}</span>${date}</h2>${sections}</section>`;
}

export function renderChangelogHtml(markdown: string): string {
  const entries = parseChangelog(markdown);
  if (entries.length === 0) {
    return `<p class="empty">No release notes yet.</p>`;
  }
  return entries.map(renderEntry).join("");
}
