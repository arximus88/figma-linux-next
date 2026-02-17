import { spawnSync } from "node:child_process";
import { readFile } from "fs/promises";
import { statSync } from "fs";
import { logger } from "Main/Logger";
import fontkit from "fontkit";

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
    let files: string[] = [];

    // Find all font files (.ttf, .otf, .ttc, etc.)
    await Promise.all(
      dirs.map((dir) =>
        this.find(dir, "*.{ttf,otf,ttc,otc}").then((a) => (files = [...files, ...a])),
      ),
    );

    for (const path of files) {
      try {
        // fontkit.openSync returns a Font object or a FontCollection
        const fontOrCollection = fontkit.openSync(path);
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
    }
  }

  private mapToFigma(font: any, path: string): Fonts.IFontsFigmaItem {
      const isItalic = font.italicAngle !== 0 || (font.subfamilyName && font.subfamilyName.toLowerCase().includes('italic'));
      
      // Weight mapping (OS/2 table usually has usWeightClass)
      let weight = 400;
      if (font['OS/2'] && font['OS/2'].usWeightClass) {
          weight = font['OS/2'].usWeightClass;
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

  private find = async (path: string, wilecard: string) => {
    return new Promise<string[]>((resolve) => {
      try {
        statSync(path);
      } catch (error) {
        resolve([]);
        return;
      }

      const find = spawnSync("find", [path, "-type", "f", "-name", wilecard]);

      resolve(
        find.stdout
          .toString()
          .split("\n")
          .filter((s) => !!s),
      );
    });
  };
}
