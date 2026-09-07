import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/segmented-recovery/node.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    allowOnly: false,
    testTimeout: 180000,
  },
});
