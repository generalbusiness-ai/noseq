import { defineConfig } from "@playwright/test";
if (!process.env.NOSEQ_PROTOCOL_RUN) throw new Error("NOSEQ_PROTOCOL_RUN must name a unique retained run directory");
export default defineConfig({ testDir: "tests/protocol-feasibility", testMatch: "browser.test.ts", workers: 1, retries: 0, forbidOnly: true, timeout: 60000,
  outputDir: `${process.env.NOSEQ_PROTOCOL_RUN}/attachments`, reporter: [["list"], ["json", { outputFile: `${process.env.NOSEQ_PROTOCOL_RUN}/browser.json` }]],
  use: { browserName: "chromium", headless: true, baseURL: "http://127.0.0.1:4176" },
  webServer: { command: "node node_modules/vite/bin/vite.js preview --config protocol-feasibility.vite.config.ts --configLoader native --host 127.0.0.1 --port 4176 --strictPort", url: "http://127.0.0.1:4176", reuseExistingServer: false },
});
