import { spawn } from "node:child_process";
import { readFile } from "fs/promises";
import { statSync } from "fs";
import * as fontkit from "fontkit"; // types provided by Fonts namespace
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

  /**
   * Core logic for populating Figma-compatible font metadata.
   * Figma's internal local font indexer expects a map of path -> style[].
   * For variable fonts, it requires:
   * 1. style.variationAxes: [{tag, name, min, max, default, value}]
   *    Note: 'value' must be the specific coordinate for THIS named instance.
   * 2. style.variationAxisValues: [{tag, value}]
   * 3. style.useFontOpticalSize: boolean (true if 'opsz' axis exists)
   */
  /** True for fonts in the standard Linux user font directories. Used to flag
   *  entries as `user_installed` so they appear under Figma's "Installed by you"
   *  filter — system fonts in /usr/share/fonts stay out of that bucket. */
  private isUserInstalledPath(filePath: string): boolean {
    const home = process.env.HOME;
    if (!home) return false;
    return (
      filePath.startsWith(`${home}/.local/share/fonts/`) ||
      filePath.startsWith(`${home}/.fonts/`)
    );
  }

  private async loadFonts(dirs: Array<string>) {
    const result: Fonts.IFonts = {};
    const suspectedVariableFiles = new Set<string>();

    // Phase 1: Enumerate all system fonts via fc-list (fast, covers 99% of fonts)
    try {
      const lines = await this.runFcList();
      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split("\t");
        if (parts.length < 8) continue;

        const [filePath, family, style, postscript, weightStr, slantStr, widthStr, indexStr] =
          parts;
        if (!filePath || !family) continue;

        // Mark variable-font "range" entries (e.g. weight="[0 215]") for Phase 3 enhancement.
        // We skip processing these rows as named instances but use them to identify variable fonts.
        if (weightStr.includes("[") || widthStr.includes("[")) {
          suspectedVariableFiles.add(filePath);
          continue;
        }

        const fcWeight = parseInt(weightStr, 10);
        const fcWidth = parseInt(widthStr, 10);
        const slant = parseInt(slantStr, 10);
        if (isNaN(fcWeight)) continue;

        const fontIndex = indexStr ? parseInt(indexStr, 10) : undefined;
        const styleName = (style || "Regular").trim();
        const item: Fonts.IFontsFigmaItem = {
          postscript: postscript || `${family.replace(/ /g, "")}-${styleName.replace(/ /g, "")}`,
          family: family.trim(),
          id: postscript || family,
          style: styleName,
          name: styleName,
          index: isNaN(fontIndex!) ? undefined : fontIndex,
          weight: fcWeightToCSS(fcWeight),
          stretch: fcWidthToStretch(isNaN(fcWidth) ? 100 : fcWidth),
          italic: slant > 0,
          user_installed: this.isUserInstalledPath(filePath),
        };

        if (!result[filePath]) result[filePath] = [];
        result[filePath].push(item);
      }
    } catch (error) {
      logger.warn("fc-list failed, falling back to fontkit:", error.message);
    }

    // Phase 2: Supplement with custom directories not covered by fontconfig
    const fcFiles = new Set(Object.keys(result));
    for (const dir of dirs) {
      try {
        const files = await this.findFontFiles(dir);
        const newFiles = files.filter((f) => !fcFiles.has(f));
        if (newFiles.length === 0) continue;

        logger.info(`FontManager: scanning ${newFiles.length} non-fontconfig font(s) from ${dir}`);

        await Promise.all(
          newFiles.map(async (filePath) => {
            try {
              const fontOrCollection = (await fontkit.open(filePath)) as Fonts.FontKitResult;
              const isCollection = fontOrCollection.type === "TTC";
              const fonts: Fonts.FontKitFont[] = isCollection
                ? (fontOrCollection as Fonts.FontKitCollection).fonts
                : [fontOrCollection as Fonts.FontKitFont];
              const items: Fonts.IFontsFigmaItem[] = [];

              for (const font of fonts) {
                const isItalic =
                  font.italicAngle !== 0 ||
                  (font.subfamilyName && font.subfamilyName.toLowerCase().includes("italic"));
                let weight = 400;
                if (font["OS/2"]?.usWeightClass) weight = font["OS/2"].usWeightClass;
                const styleName = font.subfamilyName || "Regular";

                const item: Fonts.IFontsFigmaItem = {
                  postscript: font.postscriptName,
                  family: font.familyName,
                  id: font.postscriptName,
                  style: styleName,
                  name: styleName,
                  weight,
                  stretch: 5,
                  italic: isItalic,
                  user_installed: true,
                };

                // Extract variable metadata immediately for custom fonts
                this.enhanceWithVariableMetadata(item, font as Fonts.FontKitFont);
                items.push(item);
              }

              if (items.length > 0) result[filePath] = items;
            } catch (e) {
              logger.warn(`skip font: ${filePath}, error: ${e.message}`);
            }
          }),
        );
      } catch {
        // ignore unreadable dirs
      }
    }

    // Phase 3: Enhancement - Extract metadata for variable fonts found via fc-list.
    // We ONLY open files that fc-list flagged as variable, saving massive I/O.
    await Promise.all(
      Array.from(suspectedVariableFiles).map(async (filePath) => {
        if (!result[filePath]) return;
        try {
          const styles = result[filePath];
          const fontOrCollection = (await fontkit.open(filePath)) as Fonts.FontKitResult;
          const isCollection = fontOrCollection.type === "TTC";
          const fonts: Fonts.FontKitFont[] = isCollection
            ? (fontOrCollection as Fonts.FontKitCollection).fonts
            : [fontOrCollection as Fonts.FontKitFont];

          for (const font of fonts) {
            if (font.variationAxes && Object.keys(font.variationAxes).length > 0) {
              for (const style of styles) {
                // Match by index if available (more reliable than PostScript for TTCs)
                // Otherwise fall back to PostScript matching for non-TTC files
                let matched = false;
                if (style.index !== undefined && style.index < fonts.length) {
                  this.enhanceWithVariableMetadata(style, fonts[style.index] as Fonts.FontKitFont);
                  matched = true;
                } else if (fonts.length === 1 || style.postscript === font.postscriptName) {
                  this.enhanceWithVariableMetadata(style, font as Fonts.FontKitFont);
                  matched = true;
                }
                if (matched && fonts.length > 1) break; // only match once per style
              }
            }
          }
        } catch (e) {
          // ignore enhancement errors for individual files
        }
      }),
    );

    this.fontList = result;
    const totalFaces = Object.values(result).reduce((s, arr) => s + arr.length, 0);
    logger.info(
      `FontManager: loaded ${totalFaces} font faces from ${Object.keys(result).length} files`,
    );
  }

  /**
   * Helper to populate variationAxes and variationAxisValues from a fontkit object.
   */
  private enhanceWithVariableMetadata(item: Fonts.IFontsFigmaItem, font: Fonts.FontKitFont) {
    if (!font.variationAxes || Object.keys(font.variationAxes).length === 0) return;

    const variationAxesBase = Object.entries(font.variationAxes).map(([tag, axis]) => ({
      tag,
      name: axis.name,
      min: axis.min,
      max: axis.max,
      default: axis.default,
    }));

    item.useFontOpticalSize = !!font.variationAxes["opsz"];

    // 1. variationAxisValues: The raw coordinates for this named instance
    if (font.namedVariations && font.namedVariations[item.style]) {
      const variation = font.namedVariations[item.style];
      item.variationAxisValues = Object.entries(variation).map(([tag, value]) => ({
        tag,
        value: value as number,
      }));

      // 2. variationAxes (with 'value'): Figma's UI needs the current coordinate
      // to be present directly on the axis definition to show the sliders correctly.
      item.variationAxes = variationAxesBase.map((axis) => ({
        ...axis,
        value: (variation as Record<string, number>)[axis.tag] ?? axis.default,
      }));
    } else {
      // Fallback for variable fonts without matching named variations in the metadata
      // We still provide the axis values (at defaults) so Figma enables the variable UI.
      item.variationAxisValues = variationAxesBase.map((axis) => ({
        tag: axis.tag,
        value: axis.default,
      }));
      item.variationAxes = variationAxesBase.map((axis) => ({
        ...axis,
        value: axis.default,
      }));
    }
  }

  private runFcList(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // %{family[0]} picks the first (English) family name from comma-separated list
      const format =
        "%{file}\t%{family[0]}\t%{style[0]}\t%{postscriptname}\t%{weight}\t%{slant}\t%{width}\t%{index}\n";
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
