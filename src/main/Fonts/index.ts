import { spawn } from "node:child_process";
import { readFile } from "fs/promises";
import { statSync } from "fs";
import { logger } from "Main/Logger";

// Fontconfig weight → CSS usWeightClass (piecewise linear, matches FcWeightToOpenType)
const FC_WEIGHT_MAP: [number, number][] = [
  [0, 100],
  [40, 200],
  [50, 300],
  [55, 350],
  [75, 380],
  [80, 400],
  [100, 500],
  [180, 600],
  [200, 700],
  [205, 800],
  [210, 900],
];

function fcWeightToCSS(fcWeight: number): number {
  if (fcWeight <= FC_WEIGHT_MAP[0][0]) return FC_WEIGHT_MAP[0][1];
  for (let i = 1; i < FC_WEIGHT_MAP.length; i++) {
    const [fc0, css0] = FC_WEIGHT_MAP[i - 1];
    const [fc1, css1] = FC_WEIGHT_MAP[i];
    if (fcWeight <= fc1) {
      const t = (fcWeight - fc0) / (fc1 - fc0);
      return Math.round(css0 + t * (css1 - css0));
    }
  }
  return 900;
}

// Fontconfig width → CSS usWidthClass (1–9)
function fcWidthToStretch(fcWidth: number): number {
  if (fcWidth <= 50) return 1;
  if (fcWidth <= 63) return 2;
  if (fcWidth <= 75) return 3;
  if (fcWidth <= 87) return 4;
  if (fcWidth <= 100) return 5;
  if (fcWidth <= 113) return 6;
  if (fcWidth <= 125) return 7;
  if (fcWidth <= 150) return 8;
  return 9;
}

export default class FontManager {
  private fontList: Fonts.IFonts = {};
  private loaded = false;

  public getFonts = async (dirs: Array<string>): Promise<Fonts.IFonts> => {
    if (!this.loaded) {
      await this.loadFonts(dirs);
      this.loaded = true;
    }
    return this.fontList;
  };

  public getFontFile = async (path: string): Promise<Buffer> => {
    return readFile(path);
  };

  private async loadFonts(dirs: Array<string>) {
    const result: Fonts.IFonts = {};

    // Primary: use fc-list to enumerate all fontconfig-registered fonts.
    // This correctly handles variable fonts (each named instance as a separate entry),
    // user fonts in ~/.local/share/fonts, and all system fonts.
    try {
      const lines = await this.runFcList();
      for (const line of lines) {
        if (!line.trim()) continue;

        // Format: file\tfamily\tstyle\tpostscript\tweight\tslant\twidth
        const parts = line.split("\t");
        if (parts.length < 7) continue;

        const [filePath, family, style, postscript, weightStr, slantStr, widthStr] = parts;
        if (!filePath || !family) continue;

        // Skip variable-font "range" entries (e.g. weight="[0 215]") —
        // fontconfig also emits one entry per named instance which covers these.
        if (weightStr.includes("[") || widthStr.includes("[")) continue;

        const fcWeight = parseInt(weightStr, 10);
        const fcWidth = parseInt(widthStr, 10);
        const slant = parseInt(slantStr, 10);
        if (isNaN(fcWeight)) continue;

        const item: Fonts.IFontsFigmaItem = {
          postscript:
            postscript || `${family.replace(/ /g, "")}-${(style || "Regular").replace(/ /g, "")}`,
          family: family.trim(),
          id: postscript || family,
          style: (style || "Regular").trim(),
          weight: fcWeightToCSS(fcWeight),
          stretch: fcWidthToStretch(isNaN(fcWidth) ? 100 : fcWidth),
          italic: slant > 0,
        };

        if (!result[filePath]) result[filePath] = [];
        result[filePath].push(item);
      }
    } catch (error) {
      logger.warn("fc-list failed, falling back to fontkit:", error.message);
    }

    // Supplement: scan any custom dirs whose fonts are not already covered by fontconfig.
    // This handles fonts in non-standard locations that aren't registered with fontconfig.
    const fcFiles = new Set(Object.keys(result));
    for (const dir of dirs) {
      try {
        const files = await this.findFontFiles(dir);
        const newFiles = files.filter((f) => !fcFiles.has(f));
        if (newFiles.length === 0) continue;

        logger.info(`FontManager: scanning ${newFiles.length} non-fontconfig font(s) from ${dir}`);
        const fontkit = await import("fontkit");

        await Promise.all(
          newFiles.map(async (filePath) => {
            try {
              const fontOrCollection = await fontkit.open(filePath);
              const fonts: any[] =
                "fonts" in fontOrCollection ? fontOrCollection.fonts : [fontOrCollection];
              const items: Fonts.IFontsFigmaItem[] = [];

              for (const font of fonts) {
                const isItalic =
                  font.italicAngle !== 0 ||
                  (font.subfamilyName && font.subfamilyName.toLowerCase().includes("italic"));
                let weight = 400;
                if (font["OS/2"]?.usWeightClass) weight = font["OS/2"].usWeightClass;
                items.push({
                  postscript: font.postscriptName,
                  family: font.familyName,
                  id: font.postscriptName,
                  style: font.subfamilyName || "Regular",
                  weight,
                  stretch: 5,
                  italic: isItalic,
                });
              }

              if (items.length > 0) result[filePath] = items;
            } catch (e) {
              logger.warn(`skip font: ${filePath}, error: ${e.message}`);
            }
          }),
        );
      } catch {
        // dir doesn't exist or unreadable — skip silently
      }
    }

    this.fontList = result;
    const totalFaces = Object.values(result).reduce((s, arr) => s + arr.length, 0);
    logger.info(
      `FontManager: loaded ${totalFaces} font faces from ${Object.keys(result).length} files`,
    );
  }

  private runFcList(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // %{family[0]} picks the first (English) family name from comma-separated list
      const format =
        "%{file}\t%{family[0]}\t%{style[0]}\t%{postscriptname}\t%{weight}\t%{slant}\t%{width}\n";
      const fc = spawn("fc-list", [`--format=${format}`]);
      let stdout = "";
      let stderr = "";

      fc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      fc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      fc.on("error", reject);
      fc.on("close", (code) => {
        if (code !== 0 && stderr) logger.warn(`fc-list exited ${code}: ${stderr}`);
        resolve(stdout.split("\n"));
      });
    });
  }

  private findFontFiles(dir: string): Promise<string[]> {
    return new Promise((resolve) => {
      try {
        statSync(dir);
      } catch {
        resolve([]);
        return;
      }

      const args = [
        dir,
        "-type",
        "f",
        "(",
        "-name",
        "*.ttf",
        "-o",
        "-name",
        "*.otf",
        "-o",
        "-name",
        "*.ttc",
        "-o",
        "-name",
        "*.otc",
        ")",
      ];
      const find = spawn("find", args);
      let stdout = "";

      find.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      find.on("error", () => resolve([]));
      find.on("close", () => {
        resolve(stdout.split("\n").filter(Boolean));
      });
    });
  }
}
