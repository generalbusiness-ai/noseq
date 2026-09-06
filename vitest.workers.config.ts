import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.jsonc" },
    remoteBindings: false,
  })],
  test: {
    include: ["tests/workers/**/*.test.ts"],
    passWithNoTests: false,
    allowOnly: false,
    fileParallelism: false,
  },
});
