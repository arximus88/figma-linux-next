import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import electron from "vite-plugin-electron";
import path from "path";

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
