import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/protocol-feasibility/gateway.test.ts"], fileParallelism: false, maxWorkers: 1, allowOnly: false, testTimeout: 90000 } });
