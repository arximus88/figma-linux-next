import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    // Electron tests don't use a browser — config here is for
    // any auxiliary browser pages that Playwright might spawn.
    headless: false,
  },
  // Run test files sequentially (Electron launches one process per test file)
  workers: 1,
});
