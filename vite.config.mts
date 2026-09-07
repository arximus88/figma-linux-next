import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import electron from "vite-plugin-electron";
import path from "path";
import { generateChangelogData } from "./scripts/generate-changelog-data.mjs";

const CHANGELOG_PATH = path.resolve(import.meta.dirname, "CHANGELOG.md");
const PKG_PATH = path.resolve(import.meta.dirname, "package.json");

const changelogDataPlugin = {
  name: "changelog-data",
  buildStart() {
    generateChangelogData(import.meta.dirname);
  },
  configureServer(server: any) {
    generateChangelogData(import.meta.dirname);
    server.watcher.add(CHANGELOG_PATH);
    server.watcher.add(PKG_PATH);
    server.watcher.on("change", (changed: string) => {
      if (changed === CHANGELOG_PATH || changed === PKG_PATH) generateChangelogData(import.meta.dirname);
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
        // vite-plugin-electron@1 launches electron with cwd = vite root ("src"),
        // where electron reads src/package.json (main: "main/main.js") and can't
        // find the build output (it lives in dist/main/main.js). Launch from the
        // project root instead, so electron resolves package.json#main correctly.
        onstart({ startup }) {
          startup([".", "--no-sandbox"], { cwd: import.meta.dirname });
        },
        vite: {
          define: {
            "import.meta.url": 'require("url").pathToFileURL(__filename).href',
          },
          resolve: {
            alias: {
              Main: path.resolve(import.meta.dirname, "src/main"),
              Types: path.resolve(import.meta.dirname, "src/types"),
              Const: path.resolve(import.meta.dirname, "src/constants"),
              Utils: path.resolve(import.meta.dirname, "src/utils"),
              Enums: path.resolve(import.meta.dirname, "src/types/enums.ts"),
              Storage: path.resolve(import.meta.dirname, "src/main/Storage.ts"),
            },
          },
          build: {
            outDir: "../dist/main",
            lib: {
              entry: path.resolve(import.meta.dirname, "src/main/index.ts"),
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
        // Preload/renderer-side scripts must not spawn their own electron; just
        // reload the app the main entry launched when they rebuild.
        onstart({ reload }) {
          reload();
        },
        vite: {
          resolve: {
            alias: {
              Types: path.resolve(import.meta.dirname, "src/types"),
              Const: path.resolve(import.meta.dirname, "src/constants"),
              Utils: path.resolve(import.meta.dirname, "src/utils"),
              Common: path.resolve(import.meta.dirname, "src/renderer/Common"),
              Containers: path.resolve(import.meta.dirname, "src/renderer/Common/Containers"),
              Icons: path.resolve(import.meta.dirname, "src/renderer/Common/Icons"),
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
        onstart({ reload }) {
          reload();
        },
        vite: {
          resolve: {
            alias: {
              Types: path.resolve(import.meta.dirname, "src/types"),
              Const: path.resolve(import.meta.dirname, "src/constants"),
              Utils: path.resolve(import.meta.dirname, "src/utils"),
              Common: path.resolve(import.meta.dirname, "src/renderer/Common"),
              Containers: path.resolve(import.meta.dirname, "src/renderer/Common/Containers"),
              Icons: path.resolve(import.meta.dirname, "src/renderer/Common/Icons"),
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
        onstart({ reload }) {
          reload();
        },
        vite: {
          resolve: {
            alias: {
              Types: path.resolve(import.meta.dirname, "src/types"),
              Const: path.resolve(import.meta.dirname, "src/constants"),
              Utils: path.resolve(import.meta.dirname, "src/utils"),
              Common: path.resolve(import.meta.dirname, "src/renderer/Common"),
              Containers: path.resolve(import.meta.dirname, "src/renderer/Common/Containers"),
              Icons: path.resolve(import.meta.dirname, "src/renderer/Common/Icons"),
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
        app: path.resolve(import.meta.dirname, "src/index.html"),
        settings: path.resolve(import.meta.dirname, "src/settings.html"),
        changelog: path.resolve(import.meta.dirname, "src/changelog.html"),
        preview: path.resolve(import.meta.dirname, "src/preview.html"),
      },
      // NOTE: No Node.js modules here! This builds for the browser (renderer with contextIsolation).
      // Only the electron plugin entries (main, preloads) should have Node.js externals.
    },
  },
  resolve: {
    alias: {
      Types: path.resolve(import.meta.dirname, "src/types"),
      Const: path.resolve(import.meta.dirname, "src/constants"),
      Utils: path.resolve(import.meta.dirname, "src/utils"),
      Common: path.resolve(import.meta.dirname, "src/renderer/Common"),
      Containers: path.resolve(import.meta.dirname, "src/renderer/Common/Containers"),
      Icons: path.resolve(import.meta.dirname, "src/renderer/Common/Icons"),
    },
  },
});
