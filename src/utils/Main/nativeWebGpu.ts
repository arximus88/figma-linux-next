/**
 * Does Chromium already run WebGPU natively on this GPU under Wayland?
 *
 * Figma's Shader / Halftone / Noise effects need WebGPU output composited onto
 * the GL canvas (Chromium feature `webgpu_on_vk_via_gl_interop`). Chromium
 * blocks that on Linux through `software_rendering_list.json` entry 186
 * (crbug 442791440 / 475935650) except for vendors it has qualified: Intel
 * Gen12+ on Mesa 22+ since Chrome 145, NVIDIA driver 535.183.01+ since Chrome
 * 147. On a blocked GPU the only way through is `--ignore-gpu-blocklist`, which
 * on Wayland also turns on Vulkan compositing that the Wayland platform rejects,
 * hence the relaunch under XWayland in index.ts. On an allowlisted GPU none of
 * that is needed: measured 2026-10-11 on an RTX 3080 (driver 615.78) with
 * Electron 44, native Wayland, no flags — "WebGPU: Hardware accelerated",
 * "WebGPU interop: Hardware accelerated".
 *
 * Only NVIDIA is recognised here. The driver version is in
 * /proc/driver/nvidia/version, readable before Chromium starts (the GPU
 * process does not exist yet when the relaunch decision is made). Intel Gen12
 * would need a PCI-id table plus the Mesa version; left to a later change.
 */

import { readFileSync } from "node:fs";

export const NVIDIA_NATIVE_WEBGPU_MIN_DRIVER = "535.183.01";

export interface GpuFacts {
  /** NVIDIA kernel driver version, e.g. "615.78.08", or null without the proprietary/open driver. */
  nvidiaDriver: string | null;
}

/** What callers pass when nothing is known — the pre-existing XWayland behaviour. */
export const UNKNOWN_GPU: GpuFacts = { nvidiaDriver: null };

/**
 * The version out of /proc/driver/nvidia/version. Both driver flavours print it
 * as the first dotted number after "Module":
 *   NVRM version: NVIDIA UNIX x86_64 Kernel Module  535.183.01  Sun May 12 ...
 *   NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  615.78.08  Release Build ...
 */
export function parseNvidiaDriverVersion(procText: string): string | null {
  const m = /Module[^\n]*?\s(\d+\.\d+(?:\.\d+)?)\s/.exec(procText);
  return m ? m[1] : null;
}

/** Dotted numeric compare; a missing component counts as 0 ("550.54" >= "550.54.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function hasNativeWebGpu(gpu: GpuFacts): boolean {
  return (
    gpu.nvidiaDriver !== null &&
    compareVersions(gpu.nvidiaDriver, NVIDIA_NATIVE_WEBGPU_MIN_DRIVER) >= 0
  );
}

export function readGpuFacts(): GpuFacts {
  try {
    return {
      nvidiaDriver: parseNvidiaDriverVersion(readFileSync("/proc/driver/nvidia/version", "utf8")),
    };
  } catch {
    return UNKNOWN_GPU;
  }
}
