import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["tests/protocol-closure/authority.test.ts"],fileParallelism:false,maxWorkers:1,allowOnly:false,
  hookTimeout:180000,testTimeout:600000}});
