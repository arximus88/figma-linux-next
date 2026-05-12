import fs from "fs";
import path from "path";
import { renderChangelogHtml } from "../src/renderer/Changelog/buildHtml";

export function generateChangelogData(rootDir: string = process.cwd()): boolean {
  const md = fs.readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf-8");
  const version =
    JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")).version || "";
  const html = renderChangelogHtml(md);

  const out =
    "// AUTO-GENERATED at build time. Do not edit. Source: CHANGELOG.md\n" +
    "// eslint-disable-next-line\n" +
    `export const CHANGELOG_HTML = ${JSON.stringify(html)};\n` +
    `export const CURRENT_VERSION = ${JSON.stringify(version)};\n`;

  const target = path.join(rootDir, "src/renderer/Changelog/_data.ts");
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf-8") : "";
  if (existing === out) return false;
  fs.writeFileSync(target, out);
  return true;
}

if (import.meta.main) {
  const root = process.cwd();
  const target = path.join(root, "src/renderer/Changelog/_data.ts");
  const written = generateChangelogData(root);
  console.log(written ? `Wrote ${path.relative(root, target)}` : `${path.relative(root, target)} up to date`);
}
