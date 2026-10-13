import { describe, expect, it, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareVersions,
  hasNativeWebGpu,
  NVIDIA_NATIVE_WEBGPU_MIN_DRIVER,
  parseNvidiaDriverVersion,
  UNKNOWN_GPU,
  readGpuFacts,
} from "Utils/Main/nativeWebGpu";

const OPEN_MODULE =
  "NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  615.78.08  Release Build  (notroot@)  Fri Oct  9 15:54:18 UTC 2026\nGCC version:  gcc version 15.2.1\n";
const PROPRIETARY =
  "NVRM version: NVIDIA UNIX x86_64 Kernel Module  535.183.01  Sun May 12 19:39:15 UTC 2024\nGCC version:  gcc version 13.2.0\n";

describe("parseNvidiaDriverVersion", () => {
  it("reads both driver flavours of /proc/driver/nvidia/version", () => {
    expect(parseNvidiaDriverVersion(OPEN_MODULE)).toBe("615.78.08");
    expect(parseNvidiaDriverVersion(PROPRIETARY)).toBe("535.183.01");
  });

  it("is null for anything else", () => {
    expect(parseNvidiaDriverVersion("")).toBeNull();
    expect(parseNvidiaDriverVersion("NVRM version: garbage\n")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares component-wise, missing components count as zero", () => {
    expect(compareVersions("535.183.01", "535.183.01")).toBe(0);
    expect(compareVersions("535.154.05", "535.183.01")).toBe(-1);
    expect(compareVersions("550.54", "535.183.01")).toBe(1);
    expect(compareVersions("550.54", "550.54.0")).toBe(0);
    expect(compareVersions("470.256.02", "535.183.01")).toBe(-1);
    expect(compareVersions("1000.1", "999.99.99")).toBe(1);
  });
});

describe("hasNativeWebGpu", () => {
  it("is Chromium's NVIDIA allowlist threshold, inclusive", () => {
    expect(hasNativeWebGpu({ nvidiaDriver: NVIDIA_NATIVE_WEBGPU_MIN_DRIVER })).toBe(true);
    expect(hasNativeWebGpu({ nvidiaDriver: "615.78.08" })).toBe(true);
    expect(hasNativeWebGpu({ nvidiaDriver: "535.154.05" })).toBe(false);
    expect(hasNativeWebGpu({ nvidiaDriver: "470.256.02" })).toBe(false);
  });

  it("is false when nothing is known — the XWayland behaviour stays the default", () => {
    expect(hasNativeWebGpu(UNKNOWN_GPU)).toBe(false);
  });
});

describe("readGpuFacts", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });
  function fixture(vendors: string[]) {
    root = mkdtempSync(join(tmpdir(), "figma-gpu-"));
    const driver = join(root, "version");
    const drm = join(root, "drm");
    mkdirSync(drm);
    writeFileSync(driver, OPEN_MODULE);
    vendors.forEach((vendor, i) => {
      const device = join(drm, `card${i}`, "device");
      mkdirSync(device, { recursive: true });
      writeFileSync(join(device, "vendor"), vendor);
    });
    return { driver, drm };
  }
  it("recognizes an NVIDIA-only machine", () => {
    const { driver, drm } = fixture(["0x10de\n"]);
    expect(hasNativeWebGpu(readGpuFacts(driver, drm))).toBe(true);
  });
  it("does not infer the active GPU from an NVIDIA driver on a hybrid machine", () => {
    for (const vendors of [
      ["0x8086", "0x10de"],
      ["0x1002", "0x10de"],
    ]) {
      const { driver, drm } = fixture(vendors);
      expect(readGpuFacts(driver, drm)).toEqual(UNKNOWN_GPU);
      rmSync(root!, { recursive: true, force: true });
    }
  });
  it("falls back when vendor files, DRM devices or the driver are unavailable", () => {
    const { driver, drm } = fixture([]);
    expect(readGpuFacts(driver, drm)).toEqual(UNKNOWN_GPU);
    mkdirSync(join(drm, "card0", "device"), { recursive: true });
    expect(readGpuFacts(driver, drm)).toEqual(UNKNOWN_GPU);
    writeFileSync(join(drm, "card0", "device", "vendor"), "0x10de");
    rmSync(driver);
    expect(readGpuFacts(driver, drm)).toEqual(UNKNOWN_GPU);
  });
  it("does not accept malformed driver facts", () => {
    expect(hasNativeWebGpu({ nvidiaDriver: "invalid" })).toBe(false);
    expect(hasNativeWebGpu({ nvidiaDriver: "535..183" })).toBe(false);
  });
});
