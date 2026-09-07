import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { collectContext, observeAttempt, sha256File, writeNewRecord, assertReportPassed, vitestCases, playwrightCases, type SuiteResult } from "./evidence.ts";
import { fileManifest } from "./ordered-mls-evidence.ts";
import { closureContext, closureContracts, closureCases, gates, validateClosure, verifyClosureFiles, type ClosureEvidence } from "./protocol-closure-evidence.ts";
import { collectAuthorityPublic } from "./decision-public-evidence.ts";
import { pinnedVerifier } from "./decision-verifier-build.ts";
import { strictJSON } from "./decision-io.ts";
if(process.argv[2]==="--verify"){
  try{assert.equal(process.argv.length,4);const path=process.argv[3]!;assert(statSync(path).size<=1_048_576);const e=strictJSON(readFileSync(path,"utf8"));validateClosure(e,closureContext());verifyClosureFiles(e,dirname(path));console.log("Verified 119 source-bound cases and 10 authority groups; all full gates UNPASSED, no real adoption.");}
  catch(error){console.error(String(error));process.exitCode=1;}
}else{
  const runId=randomUUID(),directory=resolve("artifacts/protocol-closure/runs/"+runId);mkdirSync(dirname(directory),{recursive:true});mkdirSync(directory);
  const attempt=observeAttempt();writeNewRecord(join(directory,"started.json"),{runId,attempt});const suites:SuiteResult[]=[],diagnostics:string[]=[];let step=0,context:ReturnType<typeof closureContext>|undefined;
  function run(args:string[],timeout=180000){const log=join(directory,`${++step}.log`),fd=openSync(log,"wx");console.log(`Protocol closure step ${step}: node ${args.join(" ")}`);
    const r=spawnSync(process.execPath,args,{stdio:["ignore",fd,fd],timeout,env:{...process.env,CI:"true",NOSEQ_CLOSURE_RUN:directory}});closeSync(fd);process.stdout.write(readFileSync(log));
    writeNewRecord(join(directory,`${step}.command.json`),{command:process.execPath,args,cwd:process.cwd(),exitCode:r.status,signal:r.signal,error:r.error?.message??null});return r.status??1;
  }
  try{
    assert.equal(process.argv.length,2,"unknown probe arguments");collectContext();assert(process.env.NOSEQ_P1D_ARCHIVE&&process.env.NOSEQ_REAL_REPOSITORY,"Exact archived P1d evidence and real public repository paths required");
    const verifier=pinnedVerifier(),parent="artifacts/segmented-recovery/runs";mkdirSync(parent,{recursive:true});const before=new Set(readdirSync(parent));
    assert.equal(run(["scripts/segmented-recovery.ts"],1200000),0,"all 115 real prerequisites required");const added=readdirSync(parent).filter(x=>!before.has(x));assert.equal(added.length,1,"concurrent prerequisite writers unsupported");
    const prerequisite={path:`${parent}/${added[0]}/evidence.json`,sha256:sha256File(`${parent}/${added[0]}/evidence.json`),cases:115 as const};
    context=closureContext();writeNewRecord(join(directory,"context.json"),{context,prerequisite,required:closureContracts(),verifier});
    assert.equal(run(["node_modules/typescript/bin/tsc","--noEmit","-p","tsconfig.protocol-closure.json"]),0,"typecheck");
    assert.equal(run(["node_modules/vite/bin/vite.js","build","--config","protocol-closure.vite.config.ts","--configLoader","native"]),0,"actual browser bundle");
    for(const suite of closureContracts()){
      const path=join(directory,suite.id+".json"),args=suite.id==="browser"?["node_modules/@playwright/test/cli.js","test","--config","protocol-closure.playwright.config.ts"]:
        ["node_modules/vitest/vitest.mjs","run","--config",suite.id==="authority"?"decision-authority.config.ts":"protocol-closure.config.ts","--configLoader","native","--reporter=default","--reporter=json",`--outputFile=${path}`];
      let exitCode=run(args,suite.id==="authority"?1800000:300000),cases:SuiteResult["cases"]=[],reportSha256="";
      try{reportSha256=sha256File(path);const raw=strictJSON(readFileSync(path,"utf8"),8_388_608);cases=suite.id==="browser"?playwrightCases(raw):vitestCases(raw);assertReportPassed(raw,suite.id);}catch(error){diagnostics.push(String(error));exitCode=1;}
      suites.push({id:suite.id,command:suite.command,exitCode,cases,reportSha256});
    }
    assert.deepEqual(closureContext(),context,"source drift during execution");collectAuthorityPublic(directory,verifier);
    const e:ClosureEvidence={schema:"noseq/protocol-closure@1",runId,command:"npm run probe:protocol-closure",conclusion:"protocol-closure-observed; decisions-unadopted; no-security-gate-passed",context,gates,required:closureContracts(),suites,prerequisite,verifier,
      observations:Object.fromEntries(closureCases.flatMap(c=>["node-"+c+".json","browser-"+c+".json"]).map(f=>[f,sha256File(join(directory,f))])),
      browserBundle:fileManifest(join(directory,"browser-bundle")),authorityArtifacts:fileManifest(join(directory,"authority-public")),
      commands:Object.fromEntries(readdirSync(directory).filter(f=>/^[1-9][0-9]*\.(log|command.json)$/.test(f)).map(f=>[f,sha256File(join(directory,f))]))};
    writeNewRecord(join(directory,"evidence.json"),e);validateClosure(e,context);verifyClosureFiles(e,directory);
    console.log(`All 119 actual cases plus 10 authority groups verified. G1-G5 UNPASSED; no adoption.\nEvidence: ${directory}/evidence.json`);
  }catch(error){diagnostics.push(String(error));writeNewRecord(join(directory,"failure.json"),{runId,attempt,ended:observeAttempt(),context:context??null,suites,diagnostics});console.error(`Protocol closure failed; retained ${directory}\n${diagnostics.join("\n")}`);process.exitCode=1;}
}
