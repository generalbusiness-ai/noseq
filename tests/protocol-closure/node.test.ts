import { test } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diskStore } from "../segmented-recovery/store-node.ts";
import { churn } from "./churn.ts";
import { staged } from "./staged.ts";
for (const [name,run] of [["offline-membership-churn",churn],["selected-profile-staged-state",staged]] as const)
test("closure.node."+name,async()=>{
  const root=process.env.NOSEQ_CLOSURE_RUN;if(!root)throw Error("NOSEQ_CLOSURE_RUN required");
  const directory=join(root,"node-"+name);await mkdir(directory);
  const path=join(directory,"records");
  const result=await run(await diskStore(path),()=>diskStore(path),name);
  await writeFile(join(root,"node-"+name+".json"),JSON.stringify({...result,node:process.versions.node},null,2),{flag:"wx"});
});
