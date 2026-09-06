import { defineConfig } from "vitest/config";
export default defineConfig({ test: {
  environment: "node", include: ["tests/crypto-feasibility-preflight.test.ts"],
  passWithNoTests: false, allowOnly: false, fileParallelism: false, maxWorkers: 1,
} });
