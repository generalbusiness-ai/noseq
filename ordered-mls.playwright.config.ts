import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/ordered-mls", testMatch: "browser.test.ts", workers: 1, retries: 0, forbidOnly: true, timeout: 45_000,
  outputDir: `${process.env.NOSEQ_ORDERED_RUN}/attachments`,
  reporter: [["list"], ["json", { outputFile: `${process.env.NOSEQ_ORDERED_RUN}/browser.json` }]],
  use: { browserName: "chromium", headless: true, baseURL: "http://127.0.0.1:4175" },
  webServer: { command: "node node_modules/vite/bin/vite.js preview --config ordered-mls.vite.config.ts --configLoader native --host 127.0.0.1 --port 4175 --strictPort", url: "http://127.0.0.1:4175", reuseExistingServer: false },
});
