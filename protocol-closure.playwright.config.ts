import { defineConfig } from "@playwright/test";
if(!process.env.NOSEQ_CLOSURE_RUN)throw Error("NOSEQ_CLOSURE_RUN required");
export default defineConfig({testDir:"tests/protocol-closure",testMatch:"browser.test.ts",workers:1,retries:0,forbidOnly:true,timeout:180000,
  outputDir:`${process.env.NOSEQ_CLOSURE_RUN}/attachments`,reporter:[["list"],["json",{outputFile:`${process.env.NOSEQ_CLOSURE_RUN}/browser.json`}]],
  use:{browserName:"chromium",headless:true,baseURL:"http://127.0.0.1:4178"},webServer:{
    command:"node node_modules/vite/bin/vite.js preview --config protocol-closure.vite.config.ts --configLoader native --host 127.0.0.1 --port 4178 --strictPort",
    url:"http://127.0.0.1:4178",reuseExistingServer:false}});
