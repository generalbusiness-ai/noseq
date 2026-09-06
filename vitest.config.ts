import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/harness.test.ts"],
    environment: "node",
    passWithNoTests: false,
    allowOnly: false,
    fileParallelism: false,
  },
});
