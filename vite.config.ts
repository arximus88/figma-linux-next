import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import electron from "vite-plugin-electron";
import path from "path";
import fs from "fs";
import { renderChangelogHtml } from "./src/renderer/Changelog/buildHtml";

const CHANGELOG_PATH = path.resolve(__dirname, "CHANGELOG.md");
const PKG_PATH = path.resolve(__dirname, "package.json");
const DATA_PATH = path.resolve(__dirname, "src/renderer/Changelog/_data.ts");

function generateChangelogData() {
  const md = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, "utf-8") : "";
  const version = fs.existsSync(PKG_PATH)
    ? JSON.parse(fs.readFileSync(PKG_PATH, "utf-8")).version || ""
    : "";
  const html = renderChangelogHtml(md);
  const out =
    "// AUTO-GENERATED at build time. Do not edit. Source: CHANGELOG.md\n" +
    "// eslint-disable-next-line\n" +
    `export const CHANGELOG_HTML = ${JSON.stringify(html)};\n` +
    `export const CURRENT_VERSION = ${JSON.stringify(version)};\n`;
  const existing = fs.existsSync(DATA_PATH) ? fs.readFileSync(DATA_PATH, "utf-8") : "";
  if (existing !== out) fs.writeFileSync(DATA_PATH, out);
}

const changelogDataPlugin = {
  name: "changelog-data",
  buildStart() {
    generateChangelogData();
  },
  configureServer(server: any) {
    generateChangelogData();
    server.watcher.add(CHANGELOG_PATH);
    server.watcher.add(PKG_PATH);
    server.watcher.on("change", (changed: string) => {
      if (changed === CHANGELOG_PATH || changed === PKG_PATH) generateChangelogData();
    });
  },
};

export default defineConfig({
  plugins: [
    svelte({
      configFile: "../svelte.config.js",
    }),
    electron([
      {
        entry: "main/index.ts",
        vite: {
          define: {
            "import.meta.url": 'require("url").pathToFileURL(__filename).href',
          },
          resolve: {
            alias: {
              Main: path.resolve(__dirname, "src/main"),
              Types: path.resolve(__dirname, "src/types"),
              Const: path.resolve(__dirname, "src/constants"),
              Utils: path.resolve(__dirname, "src/utils"),
              Enums: path.resolve(__dirname, "src/types/enums.ts"),
              Storage: path.resolve(__dirname, "src/main/Storage.ts"),
            },
          },
          build: {
            outDir: "../dist/main",
            lib: {
              entry: path.resolve(__dirname, "src/main/index.ts"),
              formats: ["cjs"],
            },
            rollupOptions: {
              external: [
                "electron",
                "fs",
                "path",
                "child_process",
                "fontkit",
                "node:fs",
                "electron-log",
                "electron-log/main",
                "adm-zip",
                "crypto",
                "url",
              ],
              output: {
                entryFileNames: "main.js",
              },
            },
          },
        },
      },
      {
        entry: "main/preload/bridge.ts",
        vite: {
          resolve: {
            alias: {
              Types: path.resolve(__dirname, "src/types"),
              Const: path.resolve(__dirname, "src/constants"),
              Utils: path.resolve(__dirname, "src/utils"),
              Common: path.resolve(__dirname, "src/renderer/Common"),
              Containers: path.resolve(__dirname, "src/renderer/Common/Containers"),
              Icons: path.resolve(__dirname, "src/renderer/Common/Icons"),
            },
          },
          build: {
            outDir: "../dist/renderer",
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "bridge.js",
              },
            },
          },
        },
      },
      {
        entry: "renderer/DesktopAPI/loadContent.ts",
        vite: {
          resolve: {
            alias: {
              Types: path.resolve(__dirname, "src/types"),
              Const: path.resolve(__dirname, "src/constants"),
              Utils: path.resolve(__dirname, "src/utils"),
              Common: path.resolve(__dirname, "src/renderer/Common"),
              Containers: path.resolve(__dirname, "src/renderer/Common/Containers"),
              Icons: path.resolve(__dirname, "src/renderer/Common/Icons"),
            },
          },
          build: {
            outDir: "../dist/renderer",
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "loadContent.js",
              },
            },
          },
        },
      },
      {
        entry: "renderer/DesktopAPI/loadMainContent.ts",
        vite: {
          resolve: {
            alias: {
              Types: path.resolve(__dirname, "src/types"),
              Const: path.resolve(__dirname, "src/constants"),
              Utils: path.resolve(__dirname, "src/utils"),
              Common: path.resolve(__dirname, "src/renderer/Common"),
              Containers: path.resolve(__dirname, "src/renderer/Common/Containers"),
              Icons: path.resolve(__dirname, "src/renderer/Common/Icons"),
            },
          },
          build: {
            outDir: "../dist/renderer",
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "loadMainContent.js",
              },
            },
          },
        },
      },
    ]),
    changelogDataPlugin,
  ],
  root: "src",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, "src/index.html"),
        settings: path.resolve(__dirname, "src/settings.html"),
        changelog: path.resolve(__dirname, "src/changelog.html"),
      },
      // NOTE: No Node.js modules here! This builds for the browser (renderer with contextIsolation).
      // Only the electron plugin entries (main, preloads) should have Node.js externals.
    },
  },
  resolve: {
    alias: {
      Types: path.resolve(__dirname, "src/types"),
      Const: path.resolve(__dirname, "src/constants"),
      Utils: path.resolve(__dirname, "src/utils"),
      Common: path.resolve(__dirname, "src/renderer/Common"),
      Containers: path.resolve(__dirname, "src/renderer/Common/Containers"),
      Icons: path.resolve(__dirname, "src/renderer/Common/Icons"),
    },
  },
});
