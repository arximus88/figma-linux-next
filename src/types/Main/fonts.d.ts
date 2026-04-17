declare namespace Fonts {
  interface FontKitFontBase {
    type: string;
    postscriptName: string;
    familyName: string;
    subfamilyName: string;
    italicAngle: number;
    variationAxes?: Record<
      string,
      {
        name: string;
        min: number;
        default: number;
        max: number;
      }
    >;
    namedVariations?: Record<string, Record<string, number>>;
    "OS/2"?: {
      usWeightClass: number;
    };
  }

  type FontKitFont = FontKitFontBase & {
    fonts?: undefined;
  };

  type FontKitCollection = FontKitFontBase & {
    type: "TTC";
    fonts: FontKitFont[];
  };

  type FontKitResult = FontKitFont | FontKitCollection;

  interface IndexFontVariationAxis {
    tag: string;
    name: string;
    min: number;
    max: number;
    default: number;
    value?: number;
  }

  interface IndexFontVariationAxisValue {
    tag: string;
    value: number;
  }

  interface IFontsFigmaItem {
    postscript: string;
    family: string;
    id: string;
    style: string;
    name?: string;
    index?: number;
    weight: number;
    stretch: number;
    italic: boolean;
    variationAxes?: IndexFontVariationAxis[];
    variationAxisValues?: IndexFontVariationAxisValue[];
    useFontOpticalSize?: boolean;
    user_installed?: boolean;
  }

  interface IFonts {
    [path: string]: IFontsFigmaItem[];
  }

  interface NameTableResult {
    copyright: string;
    fontFamily: string;
    fontSubFamily?: string;
    fontIdentifier?: string;
    fontName: string;
    fontVersion: string;
    postscriptName: string;
    trademark?: string;
    manufacturer?: string;
    designer?: string;
    description?: string;
    vendorURL?: string;
    designerURL?: string;
    license?: string;
    licenseURL?: string;
    reserved?: string;
    preferredFamily?: string;
    preferredSubFamily?: string;
    compatibleFullName?: string;
    sampleText?: string;
    postScriptCIDfindfontName?: string;
    WWSFamilyName?: string;
    WWSSubFamilyName?: string;
  }

  interface TableName {
    checksum: number;
    contents: number;
    length: number;
  }
}
