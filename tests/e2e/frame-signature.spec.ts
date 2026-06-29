import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { closeApp, launchApp } from "./helpers/launch";

/**
 * Frame-style visual-regression oracle (computed-style DOM signature).
 *
 * Instead of pixel screenshots (fragile across font-rendering environments),
 * this captures a portable signature of the rendered panel for each frame
 * style: the element tree (tags + classes + role) plus the geometry-relevant
 * computed styles of every node. The signature is compared against a committed
 * plain-text baseline.
 *
 * Run after every frame-unification phase — it must stay byte-identical, since
 * those phases relocate/centralize styling without changing rendered output.
 * Regenerate baselines intentionally with `UPDATE_FRAME_BASELINE=1`.
 */

const BASELINE_DIR = path.join(__dirname, "baselines");

const GEO_PROPS = [
  "display",
  "width",
  "height",
  "padding",
  "margin",
  "gap",
  "align-items",
  "justify-content",
  "background-color",
  "border-radius",
  "box-shadow",
  "font-size",
  "font-weight",
  "color",
  "opacity",
];

/**
 * Locate the Panel renderer page. The app exposes several pages (panel +
 * settings/changelog/warm-tab WebContentsViews), so app.firstWindow() is not
 * reliably the panel — pick the page that actually hosts #panel.
 */
async function findPanelPage(app: Awaited<ReturnType<typeof launchApp>>["app"]) {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const has = await page.evaluate(() => !!document.querySelector("#panel")).catch(() => false);
      if (has) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error("panel page (#panel) not found");
}

/** Poll the panel DOM until #panel reports the target frame style. */
async function waitForFrame(panel: Awaited<ReturnType<typeof findPanelPage>>, style: string) {
  for (let i = 0; i < 50; i++) {
    const df = await panel.evaluate(
      () => document.querySelector("#panel")?.getAttribute("data-frame") ?? null,
    );
    if (df === style) return;
    await panel.waitForTimeout(100);
  }
  throw new Error(`#panel never reached data-frame="${style}"`);
}

async function panelSignature(panel: Awaited<ReturnType<typeof findPanelPage>>) {
  return panel.evaluate((props) => {
    const root = document.querySelector("#panel");
    if (!root) return "NO #panel";

    const pick = (el: Element) => {
      const cs = getComputedStyle(el);
      return props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join("; ");
    };

    const lines: string[] = [];
    const walk = (el: Element, depth: number) => {
      // Drop Svelte's scoped-style hash classes (svelte-xxxx) — they are an
      // implementation detail that changes when components are restructured,
      // not a visual difference.
      const cls = [...el.classList]
        .filter((c) => !c.startsWith("svelte-"))
        .sort()
        .join(".");
      const role = el.getAttribute("role");
      const tag = el.tagName.toLowerCase();
      lines.push(
        `${"  ".repeat(depth)}${tag}${cls ? `.${cls}` : ""}${role ? `[role=${role}]` : ""}`,
      );
      lines.push(`${"  ".repeat(depth)}  {${pick(el)}}`);
      if (depth < 5) {
        for (const child of Array.from(el.children)) walk(child, depth + 1);
      }
    };
    walk(root, 0);
    return `data-frame=${root.getAttribute("data-frame")}\n${lines.join("\n")}`;
  }, GEO_PROPS);
}

test.describe("Frame-style DOM signature", () => {
  for (const style of ["gnome", "windows"] as const) {
    test(`${style} panel signature is stable`, async () => {
      // Boot directly in the target frame via pre-seeded settings — no flaky
      // runtime IPC toggle.
      const handle = await launchApp({ settings: { app: { frameStyle: style } } });
      const panel = await findPanelPage(handle.app);
      await waitForFrame(panel, style);
      await panel.waitForTimeout(200);

      const sig = await panelSignature(panel);
      const baselineFile = path.join(BASELINE_DIR, `frame-${style}.txt`);

      if (process.env.UPDATE_FRAME_BASELINE) {
        fs.mkdirSync(BASELINE_DIR, { recursive: true });
        fs.writeFileSync(baselineFile, sig);
      } else {
        expect(sig).toBe(fs.readFileSync(baselineFile, "utf8"));
      }

      await closeApp(handle);
    });
  }
});
