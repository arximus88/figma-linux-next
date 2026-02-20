import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import electron from "vite-plugin-electron";
import electronRenderer from "vite-plugin-electron-renderer";
import viteCommonjs from "vite-plugin-commonjs";
import path from "path";

export default defineConfig({
  plugins: [
    svelte({ configFile: "../svelte.config.js" }),
    electron([
      {
        entry: "main/index.ts",
        vite: {
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
              entry: "main/index.ts",
              formats: ["cjs"],
              fileName: () => "main.js",
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
    emptyOutDir: false, // Don't wipe 'dist' because Rollup main keeps things there too (for now)
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, "src/index.html"),
        settings: path.resolve(__dirname, "src/settings.html"),
      },
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
