import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export function readAppVersion(): string {
  const fromElectron = app.getVersion();
  if (fromElectron && /^\d+\.\d+\.\d+/.test(fromElectron)) return fromElectron;

  const candidates = [
    path.resolve(__dirname, "../package.json"),
    path.resolve(__dirname, "../../package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (pkg?.version && pkg.name?.includes("figma-linux")) return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return fromElectron || "unknown";
}
