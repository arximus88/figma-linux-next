import { spawn } from "node:child_process";
import { readFile } from "fs/promises";
import { statSync } from "fs";
import { logger } from "Main/Logger";
import * as fontkit from "fontkit";

export default class FontManager {
  private fontList: Fonts.IFonts = {};

  public getFonts = async (dirs: Array<string>): Promise<Fonts.IFonts> => {
    await this.loadFonts(dirs);

    return this.fontList;
  };

  public getFontFile = async (path: string): Promise<Buffer> => {
    return readFile(path);
  };

  private async loadFonts(dirs: Array<string>) {
    // Find all font files (.ttf, .otf, .ttc, etc.)
    const filesArrays = await Promise.all(dirs.map((dir) => this.find(dir, "*.{ttf,otf,ttc,otc}")));

    // Flatten and deduplicate the list of files
    const uniqueFiles = Array.from(new Set(filesArrays.flat()));

    await Promise.all(
      uniqueFiles.map(async (path) => {
        try {
          // fontkit.open returns a Promise that resolves to a Font object or a FontCollection
          const fontOrCollection = await fontkit.open(path);
          let fonts: any[] = []; // Using any to avoid complex fontkit type issues for now

          if ("fonts" in fontOrCollection) {
            // It's a collection (TTC/OTC)
            fonts = fontOrCollection.fonts;
          } else {
            // It's a single font
            fonts = [fontOrCollection];
          }

          const figmaFonts: Fonts.IFontsFigmaItem[] = [];

          for (const font of fonts) {
            const variations = font.variationAxes && Object.keys(font.variationAxes).length > 0;

            if (variations && "namedVariations" in font) {
              // It's a variable font with named instances
              const namedVariations = font.namedVariations;

              for (const variationName in namedVariations) {
                const instance = font.getVariation(namedVariations[variationName]);
                figmaFonts.push(this.mapToFigma(instance, path));
              }
              // Also add the default instance if needed, or if no named variations found?
              // Typically namedVariations covers standard styles (Bold, Italic, etc.)
              if (Object.keys(namedVariations).length === 0) {
                figmaFonts.push(this.mapToFigma(font, path));
              }
            } else {
              // Standard static font
              figmaFonts.push(this.mapToFigma(font, path));
            }
          }

          if (figmaFonts.length > 0) {
            this.fontList[path] = figmaFonts;
          }
        } catch (error) {
          logger.warn(`skip font: ${path}, error: `, error.message);
        }
      }),
    );
  }

  private mapToFigma(font: any, path: string): Fonts.IFontsFigmaItem {
    const isItalic =
      font.italicAngle !== 0 ||
      (font.subfamilyName && font.subfamilyName.toLowerCase().includes("italic"));

    // Weight mapping (OS/2 table usually has usWeightClass)
    let weight = 400;
    if (font["OS/2"] && font["OS/2"].usWeightClass) {
      weight = font["OS/2"].usWeightClass;
    }

    return {
      postscript: font.postscriptName,
      family: font.familyName,
      id: font.postscriptName, // Using postscript name as ID is common, or could use family
      style: font.subfamilyName,
      weight: weight,
      stretch: 5, // Default stretch
      italic: isItalic,
    };
  }

  private find = async (path: string, wildcard: string) => {
    return new Promise<string[]>((resolve) => {
      try {
        statSync(path);
      } catch (error) {
        resolve([]);
        return;
      }

      const find = spawn("find", [path, "-type", "f", "-name", wildcard]);
      let stdout = "";

      find.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      find.on("error", (error) => {
        logger.warn(`find process error: `, error.message);
        resolve([]);
      });

      find.on("close", () => {
        resolve(stdout.split("\n").filter((s) => !!s));
      });
    });
  };
}
