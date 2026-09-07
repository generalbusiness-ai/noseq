import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ root: "tests/ordered-mls", build: { outDir: resolve(`${process.env.NOSEQ_ORDERED_RUN ?? "artifacts/ordered-mls/manual"}/browser-bundle`), emptyOutDir: true }, server: { fs: { allow: [process.cwd()] } } });
