import { defineConfig } from "vite";
import { resolve } from "node:path";
if (!process.env.NOSEQ_PROTOCOL_RUN) throw new Error("NOSEQ_PROTOCOL_RUN must name a unique retained run directory");
export default defineConfig({ root: "tests/protocol-feasibility", build: { outDir: resolve(`${process.env.NOSEQ_PROTOCOL_RUN}/browser-bundle`), emptyOutDir: true }, server: { fs: { allow: [process.cwd()] } } });
