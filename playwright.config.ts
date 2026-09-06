import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  outputDir: `${process.env.NOSEQ_EVIDENCE_DIR ?? "artifacts/manual-browser"}/attachments`,
  reporter: [["list"], ["json", { outputFile: `${process.env.NOSEQ_EVIDENCE_DIR ?? "artifacts/manual-browser"}/browser.json` }]],
  use: {
    browserName: "chromium",
    headless: true,
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
