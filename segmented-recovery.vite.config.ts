import { defineConfig } from "vite";
import { resolve } from "node:path";
if (!process.env.NOSEQ_SEGMENTED_RUN) throw Error("NOSEQ_SEGMENTED_RUN required");
export default defineConfig({
  root: "tests/segmented-recovery",
  build: {
    outDir: resolve(`${process.env.NOSEQ_SEGMENTED_RUN}/browser-bundle`),
    emptyOutDir: true,
  },
  server: { fs: { allow: [process.cwd()] } },
});
