import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/ordered-mls/node.test.ts"], environment: "node", maxWorkers: 1, fileParallelism: false, allowOnly: false } });
