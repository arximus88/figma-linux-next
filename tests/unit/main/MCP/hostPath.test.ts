/**
 * Which paths a Flatpak sandbox shares with the host (#92, section 11).
 * `/tmp/x.png` used to be reported as saved while the host's /tmp had nothing.
 */

import { describe, expect, test } from "bun:test";
import {
  isHostVisible,
  parseFlatpakFilesystems,
  pickSaveBaseDir,
  writableRoots,
} from "Main/MCP/utils/hostPath";

const HOME = "/home/u";
const APP = "app.borys.FigmaLinuxNext";
const xdg = (name: string) =>
  ({
    downloads: `${HOME}/Downloads`,
    documents: `${HOME}/Documents`,
    pictures: `${HOME}/Pictures`,
  })[name] ?? null;

/** The grants this app ships with (flatpak/app.borys.FigmaLinuxNext.yml). */
const SHIPPED = [
  "xdg-download",
  "xdg-documents",
  "/usr/share/fonts:ro",
  "/run/host/fonts:ro",
  "xdg-config/fontconfig:ro",
];

const visibleWith = (filesystems: string[]) => {
  const roots = writableRoots({ appId: APP, filesystems }, HOME, xdg);
  return (p: string) => isHostVisible(p, roots);
};

describe("parseFlatpakFilesystems", () => {
  test("reads the [Context] filesystems list and nothing else", () => {
    const info = [
      "[Application]",
      "name=app.borys.FigmaLinuxNext",
      "filesystems=decoy",
      "",
      "[Context]",
      "shared=network;ipc;",
      "filesystems=xdg-download;xdg-documents;/usr/share/fonts:ro;",
      "",
      "[Instance]",
      "filesystems=other",
    ].join("\n");
    expect(parseFlatpakFilesystems(info)).toEqual([
      "xdg-download",
      "xdg-documents",
      "/usr/share/fonts:ro",
    ]);
  });

  test("no info file content means no grants", () => {
    expect(parseFlatpakFilesystems("")).toEqual([]);
  });
});

describe("isHostVisible with the shipped grants", () => {
  const visible = visibleWith(SHIPPED);

  test("the sandbox's private /tmp is not visible", () => {
    expect(visible("/tmp/slides-test.png")).toBe(false);
    expect(visible("/var/tmp/x.png")).toBe(false);
  });

  test("Downloads and Documents are", () => {
    expect(visible(`${HOME}/Downloads/x.png`)).toBe(true);
    expect(visible(`${HOME}/Documents/sub/dir/x.png`)).toBe(true);
  });

  test("the rest of home, the default ~/Pictures/Figma included, is not", () => {
    expect(visible(`${HOME}/Pictures/Figma/x.png`)).toBe(false);
    expect(visible(`${HOME}/x.png`)).toBe(false);
  });

  test("the app's own ~/.var/app directory is, always", () => {
    expect(visible(`${HOME}/.var/app/${APP}/data/x.png`)).toBe(true);
  });

  test("a read-only grant is not a place to write", () => {
    expect(visible("/usr/share/fonts/x.png")).toBe(false);
  });

  test("a prefix that only looks like a granted directory does not count", () => {
    expect(visible(`${HOME}/Downloads-old/x.png`)).toBe(false);
    expect(visible(`${HOME}/Downloads/../x.png`)).toBe(false);
  });
});

describe("isHostVisible with user overrides", () => {
  test("home shares all of $HOME but not /tmp", () => {
    const visible = visibleWith(["home"]);
    expect(visible(`${HOME}/Pictures/Figma/x.png`)).toBe(true);
    expect(visible("/tmp/x.png")).toBe(false);
  });

  test("host shares /home and /mnt, not /tmp", () => {
    const visible = visibleWith(["host"]);
    expect(visible(`${HOME}/x.png`)).toBe(true);
    expect(visible("/mnt/data/x.png")).toBe(true);
    expect(visible("/run/media/u/stick/x.png")).toBe(true);
    expect(visible("/tmp/x.png")).toBe(false);
  });

  test("an explicit /tmp grant, a ~/ path and an xdg subpath", () => {
    const visible = visibleWith(["/tmp", "~/work", "xdg-pictures/Figma:create"]);
    expect(visible("/tmp/x.png")).toBe(true);
    expect(visible(`${HOME}/work/x.png`)).toBe(true);
    expect(visible(`${HOME}/Pictures/Figma/x.png`)).toBe(true);
    expect(visible(`${HOME}/Pictures/other.png`)).toBe(false);
  });

  test("a negated grant takes the directory away", () => {
    const visible = visibleWith(["xdg-download", "!xdg-download"]);
    expect(visible(`${HOME}/Downloads/x.png`)).toBe(false);
  });
});

describe("pickSaveBaseDir", () => {
  const visible = visibleWith(SHIPPED);

  test("under Flatpak the unshared default falls back to Downloads", () => {
    expect(pickSaveBaseDir(`${HOME}/Pictures/Figma`, `${HOME}/Downloads/Figma`, visible)).toBe(
      `${HOME}/Downloads/Figma`,
    );
  });

  test("a configured directory the host can see is kept", () => {
    expect(pickSaveBaseDir(`${HOME}/Documents/shots`, `${HOME}/Downloads/Figma`, visible)).toBe(
      `${HOME}/Documents/shots`,
    );
  });
});
