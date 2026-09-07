import { defineConfig } from "vite";
import { resolve } from "node:path";
if(!process.env.NOSEQ_CLOSURE_RUN)throw Error("NOSEQ_CLOSURE_RUN required");
export default defineConfig({root:"tests/protocol-closure",build:{outDir:resolve(process.env.NOSEQ_CLOSURE_RUN,"browser-bundle"),emptyOutDir:true},server:{fs:{allow:[process.cwd()]}}});
