import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/protocol-feasibility/node.test.ts"], fileParallelism: false, maxWorkers: 1, allowOnly: false, testTimeout: 60000 } });
