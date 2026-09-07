import { defineConfig } from "@playwright/test";
if (!process.env.NOSEQ_SEGMENTED_RUN) throw Error("NOSEQ_SEGMENTED_RUN required");
export default defineConfig({
  testDir: "tests/segmented-recovery",
  testMatch: "browser.test.ts",
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180000,
  outputDir: `${process.env.NOSEQ_SEGMENTED_RUN}/attachments`,
  reporter: [["list"], ["json", { outputFile: `${process.env.NOSEQ_SEGMENTED_RUN}/browser.json` }]],
  use: { browserName: "chromium", headless: true, baseURL: "http://127.0.0.1:4177" },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --config segmented-recovery.vite.config.ts --configLoader native --host 127.0.0.1 --port 4177 --strictPort",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
  },
});
