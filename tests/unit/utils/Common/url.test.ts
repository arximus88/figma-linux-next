import { describe, test, expect } from "bun:test";
import {
  normalizeUrl,
  getFileKeyFromUrl,
  getTabDedupKey,
  isFigmaRunUrl,
  isFileBrowserUrl,
  getEditorTypeFromUrl,
  normalizeEditorType,
} from "Utils/Common/url";
import { HOMEPAGE } from "Const";

describe("normalizeUrl", () => {
  test("replaces figma:// protocol with HOMEPAGE", () => {
    expect(normalizeUrl("figma://file/123")).toBe(`${HOMEPAGE}/file/123`);
  });

  test("does not modify standard https URLs", () => {
    expect(normalizeUrl("https://www.figma.com/file/123")).toBe("https://www.figma.com/file/123");
  });

  test("does not modify other protocols", () => {
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeUrl("ftp://example.com")).toBe("ftp://example.com");
  });

  test("does not modify empty string", () => {
    expect(normalizeUrl("")).toBe("");
  });

  test("does not modify URLs starting with figma: but without //", () => {
    expect(normalizeUrl("figma:file")).toBe("figma:file");
  });
});

describe("getFileKeyFromUrl", () => {
  test("extracts key from /design/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/design/ABC123xyz/my-file")).toBe("ABC123xyz");
  });

  test("extracts key from /file/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/file/XYZ789/name")).toBe("XYZ789");
  });

  test("extracts key from /board/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/board/KEY001/board-name")).toBe("KEY001");
  });

  test("extracts key from /proto/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/proto/PROTO1/prototype")).toBe("PROTO1");
  });

  test("extracts key from URL with node-id query param", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/design/ABC123xyz/file?node-id=1-2")).toBe(
      "ABC123xyz",
    );
  });

  test("returns null for home/recent pages", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/files/recent")).toBeNull();
    expect(getFileKeyFromUrl("https://www.figma.com/desktop_new_tab")).toBeNull();
  });

  test("returns null for community URLs", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/@figma_linux")).toBeNull();
  });

  test("returns null for invalid URL", () => {
    expect(getFileKeyFromUrl("not-a-url")).toBeNull();
    expect(getFileKeyFromUrl("")).toBeNull();
  });
});

describe("getTabDedupKey", () => {
  test("returns 'doc:<key>' for file/design/board URLs", () => {
    expect(getTabDedupKey("https://www.figma.com/file/ABC123/x")).toBe("doc:ABC123");
    expect(getTabDedupKey("https://www.figma.com/design/ABC123/x")).toBe("doc:ABC123");
    expect(getTabDedupKey("https://www.figma.com/board/ABC123/x")).toBe("doc:ABC123");
  });

  test("returns 'proto:<key>' for prototype URLs", () => {
    expect(getTabDedupKey("https://www.figma.com/proto/ABC123/x")).toBe("proto:ABC123");
    expect(getTabDedupKey("https://www.figma.com/proto/ABC123?node-id=1-2")).toBe("proto:ABC123");
  });

  test("file and proto URLs for the same key produce different dedup keys", () => {
    expect(getTabDedupKey("https://www.figma.com/file/SAME/a")).not.toBe(
      getTabDedupKey("https://www.figma.com/proto/SAME/b"),
    );
  });

  test("file, design and board with the same key dedupe together", () => {
    const a = getTabDedupKey("https://www.figma.com/file/SAME/a");
    const b = getTabDedupKey("https://www.figma.com/design/SAME/b");
    const c = getTabDedupKey("https://www.figma.com/board/SAME/c");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test("returns null for non-figma and malformed URLs", () => {
    expect(getTabDedupKey("https://www.figma.com/community/file/ABC")).toBeNull();
    expect(getTabDedupKey("not-a-url")).toBeNull();
    expect(getTabDedupKey("")).toBeNull();
  });
});

describe("isFigmaRunUrl", () => {
  test("returns true for design file URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/design/ABC123/my-file")).toBe(true);
  });

  test("returns true for file URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/file/ABC123/name")).toBe(true);
  });

  test("returns true for proto URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/proto/ABC123/proto")).toBe(true);
  });

  test("returns true for board URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/board/ABC123/board")).toBe(true);
  });

  test("returns true for figma:// protocol", () => {
    expect(isFigmaRunUrl("figma://file/ABC123")).toBe(true);
  });

  test("returns true for /files/ browser paths (file browser, not a design file)", () => {
    expect(isFigmaRunUrl("https://www.figma.com/files/recent")).toBe(true);
    expect(isFigmaRunUrl("https://www.figma.com/files/team/123/my-team")).toBe(true);
  });

  test("returns false for non-browser figma pages", () => {
    expect(isFigmaRunUrl("https://www.figma.com/desktop_new_tab")).toBe(false);
  });

  test("returns false for non-figma URLs", () => {
    expect(isFigmaRunUrl("https://google.com")).toBe(false);
    expect(isFigmaRunUrl("https://notion.so/page")).toBe(false);
  });

  test("returns false for invalid input", () => {
    expect(isFigmaRunUrl("not-a-url")).toBe(false);
    expect(isFigmaRunUrl("")).toBe(false);
  });
});

describe("isFileBrowserUrl", () => {
  test("returns true for /files/recent", () => {
    expect(isFileBrowserUrl("https://www.figma.com/files/recent")).toBe(true);
  });

  test("returns true for team browser URL", () => {
    expect(isFileBrowserUrl("https://www.figma.com/files/team/123456789/my-team")).toBe(true);
  });

  test("returns true for project browser URL", () => {
    expect(isFileBrowserUrl("https://www.figma.com/files/project/987654/my-project")).toBe(true);
  });

  test("returns false for design file URL", () => {
    expect(isFileBrowserUrl("https://www.figma.com/design/ABC123/my-file")).toBe(false);
  });

  test("returns false for old /file/ URL (singular)", () => {
    expect(isFileBrowserUrl("https://www.figma.com/file/ABC123/name")).toBe(false);
  });

  test("returns false for non-figma URL", () => {
    expect(isFileBrowserUrl("https://google.com/files/something")).toBe(false);
  });

  test("returns false for invalid input", () => {
    expect(isFileBrowserUrl("not-a-url")).toBe(false);
    expect(isFileBrowserUrl("")).toBe(false);
  });
});

describe("getEditorTypeFromUrl", () => {
  test("maps /design/ and /file/ to design", () => {
    expect(getEditorTypeFromUrl("https://www.figma.com/design/ABC/foo")).toBe("design");
    expect(getEditorTypeFromUrl("https://www.figma.com/file/ABC/foo")).toBe("design");
  });
  test("maps /board/ and /jam/ to figjam", () => {
    expect(getEditorTypeFromUrl("https://www.figma.com/board/ABC/foo")).toBe("figjam");
    expect(getEditorTypeFromUrl("https://www.figma.com/jam/ABC/foo")).toBe("figjam");
  });
  test("maps /slides/, /buzz/, /site/, /make/, /proto/ to their types", () => {
    expect(getEditorTypeFromUrl("https://www.figma.com/slides/ABC/foo")).toBe("slides");
    expect(getEditorTypeFromUrl("https://www.figma.com/buzz/ABC/foo")).toBe("buzz");
    expect(getEditorTypeFromUrl("https://www.figma.com/site/ABC/foo")).toBe("site");
    expect(getEditorTypeFromUrl("https://www.figma.com/make/ABC/foo")).toBe("make");
    expect(getEditorTypeFromUrl("https://www.figma.com/proto/ABC/foo")).toBe("prototype");
  });
  test("returns null for non-design URLs and garbage", () => {
    expect(getEditorTypeFromUrl("https://www.figma.com/files/recent")).toBeNull();
    expect(getEditorTypeFromUrl("https://example.com")).toBeNull();
    expect(getEditorTypeFromUrl("not-a-url")).toBeNull();
    expect(getEditorTypeFromUrl("")).toBeNull();
  });
});

describe("normalizeEditorType", () => {
  test("maps Figma's confirmed codenames to canonical types", () => {
    // Confirmed via [editor-type] logs from Figma's setEditorType payload (2026-05).
    expect(normalizeEditorType("cooper")).toBe("buzz");
    expect(normalizeEditorType("figmake")).toBe("make");
    expect(normalizeEditorType("sites")).toBe("site");
    expect(normalizeEditorType("figjam")).toBe("figjam");
    expect(normalizeEditorType("design")).toBe("design");
    expect(normalizeEditorType("slides")).toBe("slides");
  });

  test("accepts canonical names directly", () => {
    expect(normalizeEditorType("design")).toBe("design");
    expect(normalizeEditorType("figjam")).toBe("figjam");
    expect(normalizeEditorType("slides")).toBe("slides");
    expect(normalizeEditorType("buzz")).toBe("buzz");
    expect(normalizeEditorType("site")).toBe("site");
    expect(normalizeEditorType("make")).toBe("make");
    expect(normalizeEditorType("prototype")).toBe("prototype");
  });

  test("accepts common alternate spellings (legacy / future-proofing)", () => {
    expect(normalizeEditorType("design_file")).toBe("design");
    expect(normalizeEditorType("file")).toBe("design");
    expect(normalizeEditorType("whiteboard")).toBe("figjam");
    expect(normalizeEditorType("board")).toBe("figjam");
    expect(normalizeEditorType("jam")).toBe("figjam");
    expect(normalizeEditorType("deck")).toBe("slides");
    expect(normalizeEditorType("presentation")).toBe("slides");
    expect(normalizeEditorType("proto")).toBe("prototype");
  });

  test("is case-insensitive and trims whitespace", () => {
    expect(normalizeEditorType("DESIGN")).toBe("design");
    expect(normalizeEditorType("FigJam")).toBe("figjam");
    expect(normalizeEditorType("  cooper  ")).toBe("buzz");
    expect(normalizeEditorType("FIGMAKE")).toBe("make");
  });

  test("returns null for unknown values so caller can log them", () => {
    expect(normalizeEditorType("")).toBeNull();
    expect(normalizeEditorType("flowchart")).toBeNull();
    expect(normalizeEditorType("random-value")).toBeNull();
    expect(normalizeEditorType("undefined")).toBeNull();
  });

  test("returns null for non-string input", () => {
    expect(normalizeEditorType(null as unknown as string)).toBeNull();
    expect(normalizeEditorType(undefined as unknown as string)).toBeNull();
    expect(normalizeEditorType(42 as unknown as string)).toBeNull();
  });
});

/** Integration: simulating a full "open tab of type X" flow as Figma would in
 *  production. We can't drive the actual Figma web app from a unit test, but we
 *  can verify the URL + Figma's setEditorType payload both land on the same
 *  canonical type for each known editor surface.
 *
 *  URL is the initial signal (used until Figma fires setEditorType); the
 *  codename is what Figma sends afterwards. Both should agree. */
describe("open-tab type detection (URL + Figma codename combined)", () => {
  const fixtures: Array<{
    type: Types.EditorType;
    urls: string[];
    figmaCodenames: string[];
  }> = [
    {
      type: "design",
      urls: [
        "https://www.figma.com/design/ABC123/medics_ds",
        "https://www.figma.com/file/ABC123/legacy-design-file",
      ],
      figmaCodenames: ["design"],
    },
    {
      type: "figjam",
      urls: [
        "https://www.figma.com/board/ABC123/sitemap",
        "https://www.figma.com/jam/ABC123/legacy-jam",
        // Legacy /file/ URL — Figma's setEditorType is the source of truth here.
        "https://www.figma.com/file/BRFDLCjhwuMd03DnySCczr",
      ],
      figmaCodenames: ["figjam", "whiteboard"],
    },
    {
      type: "slides",
      urls: ["https://www.figma.com/slides/ABC123/keynote"],
      figmaCodenames: ["slides"],
    },
    {
      type: "buzz",
      urls: ["https://www.figma.com/buzz/ABC123/marketing"],
      figmaCodenames: ["cooper", "buzz"], // cooper = internal codename
    },
    {
      type: "site",
      urls: [
        "https://www.figma.com/site/ABC123/landing",
        "https://www.figma.com/file/new?editor_type=sites&localFileKey=LOCAL_xxx",
      ],
      figmaCodenames: ["sites", "site"],
    },
    {
      type: "make",
      urls: ["https://www.figma.com/make/ABC123/app"],
      figmaCodenames: ["figmake", "make"], // figmake = internal codename
    },
    {
      type: "prototype",
      urls: ["https://www.figma.com/proto/ABC123/click-through"],
      figmaCodenames: ["prototype"],
    },
  ];

  for (const fixture of fixtures) {
    test(`type "${fixture.type}" resolves correctly via Figma codenames`, () => {
      for (const codename of fixture.figmaCodenames) {
        expect(normalizeEditorType(codename)).toBe(fixture.type);
      }
    });

    test(`type "${fixture.type}" resolves correctly via URL paths (where applicable)`, () => {
      for (const url of fixture.urls) {
        const detected = getEditorTypeFromUrl(url);
        // /file/ URLs map to "design" by default; the codename signal corrects
        // them at runtime. We only check non-/file/ URLs match the expected type.
        if (!url.includes("/file/") || fixture.type === "design") {
          expect(detected).toBe(fixture.type);
        }
      }
    });
  }
});
