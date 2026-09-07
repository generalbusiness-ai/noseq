import { strict as assert } from "node:assert";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifyDecision } from "./decision-validator.ts";
let output:string|undefined,unique=false;
try {
  const args=process.argv.slice(2);assert.equal(args.length,8,"Required: --export DIR --policy EXTERNAL_FILE --output NEW_DIR --verifier PINNED_BINARY");
  const values:Record<string,string>={};for(let i=0;i<args.length;i+=2){assert(["--export","--policy","--output","--verifier"].includes(args[i]!)&&!values[args[i]!],"unknown/duplicate CLI option");values[args[i]!]=resolve(args[i+1]!);}
  output=values["--output"];assert(!existsSync(output!),"output must be a new unique run directory");unique=true;
  console.log(JSON.stringify(verifyDecision(values["--export"]!,values["--policy"]!,output!,values["--verifier"]!)));
}catch(error){const result={schema:"noseq/p1-decision-failure@1",error:String(error),activation:"not authorized"};
  if(unique&&output&&existsSync(output))try{writeFileSync(join(output,"failure.json"),JSON.stringify(result,null,2),{flag:"wx"});}catch{}
  console.error(JSON.stringify(result));process.exitCode=1;}
